import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  refreshSessionSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from "@lex/contracts";
import {
  base32Secret,
  constantTimeEqual,
  decrypt,
  encrypt,
  hmac,
  randomOtp,
  randomToken,
  sha256,
  verifyTotp,
} from "./crypto.js";
import {
  audit,
  challengeById,
  future,
  now,
  recordJobBeforePublish,
} from "./repository.js";
import { requireAuth, type AppContext } from "./middleware.js";
import type { Env, Variables } from "./types.js";

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

auth.post(
  "/otp/request",
  zValidator("json", requestOtpSchema),
  async (context) => {
    const input = context.req.valid("json");
    if (!(["en", "pcm"] as string[]).includes(input.locale))
      return context.json(
        { message: "The controlled pilot supports English and Pidgin" },
        422,
      );
    if (
      input.channel === "email" &&
      context.env.EMAIL_DELIVERY_ENABLED !== "true"
    ) {
      return context.json(
        {
          message:
            "Email delivery is not configured in this staging environment",
          capability: "email_recovery",
          status: "unavailable",
        },
        503,
      );
    }
    const destination =
      input.channel === "whatsapp" ? input.phone! : input.email!;
    const stagingTestLogin =
      context.env.APP_ENV === "staging" &&
      context.env.STAGING_TEST_LOGIN_ENABLED === "true" &&
      input.channel === "whatsapp" &&
      input.purpose === "sign_in" &&
      destination === context.env.STAGING_TEST_PHONE_E164 &&
      /^\d{6}$/u.test(context.env.STAGING_TEST_OTP_CODE ?? "");
    if (
      input.channel === "whatsapp" &&
      !stagingTestLogin &&
      context.env.DEV_OTP_ECHO !== "true" &&
      (!context.env.META_ACCESS_TOKEN || !context.env.META_PHONE_NUMBER_ID)
    ) {
      return context.json(
        {
          message: "WhatsApp OTP is not configured in this staging environment",
          capability: "whatsapp_otp",
          status: "unconfigured",
        },
        503,
      );
    }
    const destinationHash = await hmac(
      destination.toLowerCase(),
      context.env.AUTH_HMAC_PEPPER,
    );
    const ip = context.req.header("cf-connecting-ip") ?? "local";
    const ipHash = await hmac(ip, context.env.AUTH_HMAC_PEPPER);
    const deviceHash = await hmac(
      context.req.header("x-device-id") ?? "unknown",
      context.env.AUTH_HMAC_PEPPER,
    );
    const since = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    const destinationCount = await context.env.DB.prepare(
      "SELECT COUNT(*) count FROM auth_challenges WHERE destination_hash = ? AND created_at >= ?",
    )
      .bind(destinationHash, since)
      .first<{ count: number }>();
    const ipCount = await context.env.DB.prepare(
      "SELECT COUNT(*) count FROM auth_challenges WHERE request_ip_hash = ? AND created_at >= ?",
    )
      .bind(ipHash, since)
      .first<{ count: number }>();
    if ((destinationCount?.count ?? 0) >= 5 || (ipCount?.count ?? 0) >= 20)
      return context.json(
        { message: "Too many verification requests. Try again later." },
        429,
      );
    const latest = await context.env.DB.prepare(
      "SELECT created_at FROM auth_challenges WHERE destination_hash = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(destinationHash)
      .first<{ created_at: string }>();
    if (latest && Date.now() - Date.parse(latest.created_at) < 60_000)
      return context.json(
        { message: "Wait before requesting another code" },
        429,
      );

    const id = crypto.randomUUID();
    const code = stagingTestLogin
      ? context.env.STAGING_TEST_OTP_CODE!
      : randomOtp();
    const createdAt = now();
    const encryptedDestination = await encrypt(
      destination,
      context.env.FIELD_ENCRYPTION_KEY,
    );
    const codeHash = await hmac(`${id}:${code}`, context.env.AUTH_HMAC_PEPPER);
    const user = await context.env.DB.prepare(
      `SELECT id,role FROM users WHERE ${input.channel === "whatsapp" ? "phone_hash" : "email_hash"} = ?`,
    )
      .bind(destinationHash)
      .first<{ id: string; role: string }>();
    if (stagingTestLogin && user && user.role !== "client")
      return context.json(
        { message: "The staging test identity is restricted to clients" },
        403,
      );
    await context.env.DB.batch([
      context.env.DB.prepare(
        "UPDATE auth_challenges SET superseded_at = ? WHERE destination_hash = ? AND consumed_at IS NULL AND superseded_at IS NULL",
      ).bind(createdAt, destinationHash),
      context.env.DB.prepare(
        "INSERT INTO auth_challenges (id,user_id,channel,purpose,destination_hash,destination_encrypted,code_hash,attempts,max_attempts,expires_at,request_ip_hash,device_hash,created_at) VALUES (?,?,?,?,?,?,?,0,5,?,?,?,?)",
      ).bind(
        id,
        user?.id ?? null,
        input.channel,
        input.purpose,
        destinationHash,
        encryptedDestination,
        codeHash,
        future(5 * 60_000),
        ipHash,
        deviceHash,
        createdAt,
      ),
      context.env.DB.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        user?.id ?? null,
        "auth.otp_requested",
        "AuthChallenge",
        id,
        JSON.stringify({
          channel: input.channel,
          purpose: input.purpose,
          stagingTestLogin,
        }),
        context.get("requestId"),
        createdAt,
      ),
    ]);
    if (!stagingTestLogin) {
      const jobPayload = await encrypt(
        JSON.stringify({
          challengeId: id,
          channel: input.channel,
          destination,
          code,
          locale: input.locale,
        }),
        context.env.FIELD_ENCRYPTION_KEY,
      );
      await recordJobBeforePublish(context.env, {
        kind: "auth_otp",
        queueName: "notifications",
        idempotencyKey: `otp:${id}`,
        payload: { encrypted: jobPayload },
      });
    }
    return context.json(
      {
        challengeId: id,
        expiresAt: future(5 * 60_000),
        delivery: stagingTestLogin ? "staging_test" : input.channel,
        stagingTestLogin,
        ...(context.env.DEV_OTP_ECHO === "true" ? { devCode: code } : {}),
      },
      201,
    );
  },
);

auth.post(
  "/otp/verify",
  zValidator("json", verifyOtpSchema),
  async (context) => {
    const input = context.req.valid("json");
    const challenge = await challengeById(context.env, input.challengeId);
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.supersededAt ||
      Date.parse(challenge.expiresAt) <= Date.now()
    )
      return context.json({ message: "Verification challenge expired" }, 401);
    if (challenge.attempts >= challenge.maxAttempts)
      return context.json({ message: "Verification challenge locked" }, 401);
    const expected = await hmac(
      `${challenge.id}:${input.code}`,
      context.env.AUTH_HMAC_PEPPER,
    );
    if (!constantTimeEqual(expected, challenge.codeHash)) {
      await context.env.DB.prepare(
        "UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?",
      )
        .bind(challenge.id)
        .run();
      return context.json({ message: "Verification code is incorrect" }, 401);
    }
    const destination = await decrypt(
      challenge.destinationEncrypted,
      context.env.FIELD_ENCRYPTION_KEY,
    );
    const userId = challenge.userId ?? crypto.randomUUID();
    const existingAccount = challenge.userId
      ? await context.env.DB.prepare(
          "SELECT role,mfa_enabled FROM users WHERE id=? AND status='active'",
        )
          .bind(challenge.userId)
          .first<{ role: string; mfa_enabled: number }>()
      : null;
    if (existingAccount && existingAccount.role !== "client") {
      const preAuthToken = randomToken(32);
      const timestamp = now();
      const purpose = existingAccount.mfa_enabled ? "mfa_verify" : "mfa_setup";
      await context.env.DB.batch([
        context.env.DB.prepare(
          "UPDATE pre_auth_tokens SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
        ).bind(timestamp, userId),
        context.env.DB.prepare(
          "INSERT INTO pre_auth_tokens (id,user_id,challenge_id,token_hash,purpose,expires_at,created_at) VALUES (?,?,?,?,?,?,?)",
        ).bind(
          crypto.randomUUID(),
          userId,
          challenge.id,
          await sha256(preAuthToken),
          purpose,
          future(10 * 60_000),
          timestamp,
        ),
        context.env.DB.prepare(
          "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
        ).bind(
          crypto.randomUUID(),
          userId,
          "auth.primary_factor_verified",
          "User",
          userId,
          JSON.stringify({ next: purpose }),
          context.get("requestId"),
          timestamp,
        ),
      ]);
      return context.json({
        preAuthToken,
        mfaSetupRequired: purpose === "mfa_setup",
        mfaRequired: purpose === "mfa_verify",
      });
    }
    const sessionId = crypto.randomUUID();
    const accessToken = randomToken();
    const refreshToken = randomToken(48);
    const timestamp = now();
    const destinationHash = challenge.destinationHash;
    try {
      await context.env.DB.batch([
        context.env.DB.prepare(
          `INSERT OR IGNORE INTO users (id,role,status,${challenge.channel === "whatsapp" ? "phone_encrypted,phone_hash,phone_verified_at" : "email_encrypted,email_hash,email_verified_at"},preferred_language,mfa_enabled,version,created_at,updated_at) VALUES (?,'client','active',?,?,?,'en',0,1,?,?)`,
        ).bind(
          userId,
          challenge.destinationEncrypted,
          destinationHash,
          timestamp,
          timestamp,
          timestamp,
        ),
        context.env.DB.prepare(
          `UPDATE users SET ${challenge.channel === "whatsapp" ? "phone_verified_at" : "email_verified_at"} = COALESCE(${challenge.channel === "whatsapp" ? "phone_verified_at" : "email_verified_at"}, ?), updated_at = ? WHERE id = ?`,
        ).bind(timestamp, timestamp, userId),
        context.env.DB.prepare(
          "UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND superseded_at IS NULL",
        ).bind(timestamp, challenge.id),
        context.env.DB.prepare(
          "INSERT INTO sessions (id,challenge_id,user_id,access_token_hash,refresh_token_hash,device_name,device_hash,expires_at,refresh_expires_at,last_seen_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          sessionId,
          challenge.id,
          userId,
          await sha256(accessToken),
          await sha256(refreshToken),
          input.deviceName ?? null,
          challenge.deviceHash,
          future(15 * 60_000),
          future(30 * 24 * 60 * 60_000),
          timestamp,
          timestamp,
        ),
        context.env.DB.prepare(
          "INSERT OR IGNORE INTO notification_preferences (user_id,whatsapp,push,email,updated_at) VALUES (?,1,0,0,?)",
        ).bind(userId, timestamp),
        context.env.DB.prepare(
          "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
        ).bind(
          crypto.randomUUID(),
          userId,
          "auth.otp_verified",
          "User",
          userId,
          JSON.stringify({ channel: challenge.channel }),
          context.get("requestId"),
          timestamp,
        ),
      ]);
    } catch {
      return context.json(
        { message: "This verification challenge has already been used" },
        409,
      );
    }
    void destination;
    return context.json({
      accessToken,
      refreshToken,
      accessTokenExpiresAt: future(15 * 60_000),
      user: { id: userId, role: "client" },
    });
  },
);

auth.post(
  "/refresh",
  zValidator("json", refreshSessionSchema),
  async (context) => {
    const input = context.req.valid("json");
    const session = await context.env.DB.prepare(
      "SELECT s.id,s.user_id,u.role,s.refresh_expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_token_hash=? AND s.revoked_at IS NULL",
    )
      .bind(await sha256(input.refreshToken))
      .first<{
        id: string;
        user_id: string;
        role: string;
        refresh_expires_at: string;
      }>();
    if (!session || Date.parse(session.refresh_expires_at) <= Date.now())
      return context.json(
        { message: "Refresh session is invalid or expired" },
        401,
      );
    const accessToken = randomToken();
    const refreshToken = randomToken(48);
    const timestamp = now();
    await context.env.DB.prepare(
      "UPDATE sessions SET access_token_hash=?,refresh_token_hash=?,expires_at=?,refresh_expires_at=?,last_seen_at=? WHERE id=?",
    )
      .bind(
        await sha256(accessToken),
        await sha256(refreshToken),
        future(15 * 60_000),
        future(30 * 24 * 60 * 60_000),
        timestamp,
        session.id,
      )
      .run();
    return context.json({
      accessToken,
      refreshToken,
      accessTokenExpiresAt: future(15 * 60_000),
      user: { id: session.user_id, role: session.role },
    });
  },
);

auth.post("/mfa/setup", async (context) => {
  const preauth = await readPreAuth(context, "mfa_setup");
  if (!preauth)
    return context.json(
      { message: "MFA setup authorization is invalid or expired" },
      401,
    );
  const secret = base32Secret();
  await context.env.DB.prepare(
    "UPDATE users SET mfa_secret_encrypted=?,mfa_enabled=0,updated_at=? WHERE id=?",
  )
    .bind(
      await encrypt(secret, context.env.FIELD_ENCRYPTION_KEY),
      now(),
      preauth.userId,
    )
    .run();
  return context.json({
    secret,
    uri: `otpauth://totp/${encodeURIComponent("Lex Workspace")}:${encodeURIComponent(preauth.userId)}?secret=${secret}&issuer=${encodeURIComponent("Lex")}&digits=6&period=30`,
  });
});

auth.post(
  "/mfa/verify",
  zValidator(
    "json",
    z.object({
      code: z.string().regex(/^\d{6}$/u),
      deviceName: z.string().max(120).optional(),
    }),
  ),
  async (context) => {
    const preauth = await readPreAuth(context);
    if (!preauth)
      return context.json(
        { message: "MFA authorization is invalid or expired" },
        401,
      );
    const account = await context.env.DB.prepare(
      "SELECT role,mfa_secret_encrypted FROM users WHERE id=? AND status='active'",
    )
      .bind(preauth.userId)
      .first<{ role: string; mfa_secret_encrypted: string | null }>();
    if (!account?.mfa_secret_encrypted)
      return context.json({ message: "MFA has not been set up" }, 409);
    const input = context.req.valid("json");
    const secret = await decrypt(
      account.mfa_secret_encrypted,
      context.env.FIELD_ENCRYPTION_KEY,
    );
    if (!(await verifyTotp(secret, input.code)))
      return context.json({ message: "Authenticator code is incorrect" }, 401);
    const sessionId = crypto.randomUUID();
    const accessToken = randomToken();
    const refreshToken = randomToken(48);
    const timestamp = now();
    try {
      await context.env.DB.batch([
        context.env.DB.prepare(
          "UPDATE pre_auth_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
        ).bind(timestamp, preauth.id),
        context.env.DB.prepare(
          "UPDATE auth_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
        ).bind(timestamp, preauth.challengeId),
        context.env.DB.prepare(
          "UPDATE users SET mfa_enabled=1,updated_at=? WHERE id=?",
        ).bind(timestamp, preauth.userId),
        context.env.DB.prepare(
          "INSERT INTO sessions (id,challenge_id,user_id,access_token_hash,refresh_token_hash,device_name,expires_at,refresh_expires_at,last_seen_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          sessionId,
          preauth.challengeId,
          preauth.userId,
          await sha256(accessToken),
          await sha256(refreshToken),
          input.deviceName ?? null,
          future(15 * 60_000),
          future(30 * 24 * 60 * 60_000),
          timestamp,
          timestamp,
        ),
        context.env.DB.prepare(
          "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
        ).bind(
          crypto.randomUUID(),
          preauth.userId,
          "auth.mfa_verified",
          "Session",
          sessionId,
          JSON.stringify({ role: account.role }),
          context.get("requestId"),
          timestamp,
        ),
      ]);
    } catch {
      return context.json(
        { message: "MFA authorization has already been used" },
        409,
      );
    }
    return context.json({
      accessToken,
      refreshToken,
      accessTokenExpiresAt: future(15 * 60_000),
      user: { id: preauth.userId, role: account.role },
    });
  },
);

auth.use("/*", requireAuth);
auth.get("/sessions", async (context) => {
  const user = context.get("user");
  const result = await context.env.DB.prepare(
    "SELECT id,device_name,created_at,last_seen_at,expires_at,CASE WHEN id=? THEN 1 ELSE 0 END current FROM sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY last_seen_at DESC",
  )
    .bind(user.sessionId, user.id)
    .all();
  return context.json(result.results);
});
auth.delete("/sessions/:id", async (context) => {
  const user = context.get("user");
  await context.env.DB.prepare(
    "UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL",
  )
    .bind(now(), context.req.param("id"), user.id)
    .run();
  await audit(context.env, {
    actorUserId: user.id,
    action: "auth.session_revoked",
    entityType: "Session",
    entityId: context.req.param("id"),
    requestId: context.get("requestId"),
  });
  return context.body(null, 204);
});
auth.post("/logout", async (context) => {
  const user = context.get("user");
  await context.env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?")
    .bind(now(), user.sessionId)
    .run();
  return context.body(null, 204);
});
auth.post("/recovery/request", (context: AppContext) =>
  context.json(
    {
      capability: "email_recovery",
      status: "unavailable",
      message:
        "Email recovery is documented but outbound email is not configured on Free staging",
    },
    503,
  ),
);

export default auth;

async function readPreAuth(
  context: AppContext,
  requiredPurpose?: "mfa_setup" | "mfa_verify",
) {
  const authorization = context.req.header("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const row = await context.env.DB.prepare(
    "SELECT id,user_id,challenge_id,purpose,expires_at FROM pre_auth_tokens WHERE token_hash=? AND consumed_at IS NULL",
  )
    .bind(await sha256(authorization.slice(7)))
    .first<{
      id: string;
      user_id: string;
      challenge_id: string;
      purpose: "mfa_setup" | "mfa_verify";
      expires_at: string;
    }>();
  if (
    !row ||
    Date.parse(row.expires_at) <= Date.now() ||
    (requiredPurpose && row.purpose !== requiredPurpose)
  )
    return null;
  return {
    id: row.id,
    userId: row.user_id,
    challengeId: row.challenge_id,
    purpose: row.purpose,
  };
}
