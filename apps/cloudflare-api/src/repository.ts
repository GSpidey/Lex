import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { authChallenges, sessions, users } from "@lex/d1";
import type { AuthenticatedUser, Env } from "./types.js";

export const now = () => new Date().toISOString();
export const future = (milliseconds: number) =>
  new Date(Date.now() + milliseconds).toISOString();

export function database(env: Env) {
  return drizzle(env.DB);
}

export async function findActiveSession(
  env: Env,
  tokenHash: string,
): Promise<AuthenticatedUser | null> {
  const rows = await database(env)
    .select({ sessionId: sessions.id, userId: users.id, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.accessTokenHash, tokenHash),
        isNull(sessions.revokedAt),
        eq(users.status, "active"),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const valid = await env.DB.prepare(
    "SELECT 1 FROM sessions WHERE id=? AND expires_at>?",
  )
    .bind(row.sessionId, now())
    .first();
  if (!valid) return null;
  await env.DB.prepare(
    "UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?",
  )
    .bind(now(), row.sessionId, new Date(Date.now() - 300_000).toISOString())
    .run();
  return { id: row.userId, role: row.role, sessionId: row.sessionId };
}

export async function challengeById(env: Env, id: string) {
  const rows = await database(env)
    .select()
    .from(authChallenges)
    .where(eq(authChallenges.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function audit(
  env: Env,
  input: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId: string;
    matterId?: string;
    requestId?: string;
    metadata?: unknown;
  },
) {
  await env.DB.prepare(
    "INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,matter_id,metadata_json,request_id,occurred_at) VALUES (?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId,
      input.matterId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.requestId ?? null,
      now(),
    )
    .run();
}

export async function recordJobBeforePublish(
  env: Env,
  input: {
    kind: string;
    queueName: "jobs" | "notifications";
    idempotencyKey: string;
    payload: unknown;
  },
) {
  const id = crypto.randomUUID();
  const timestamp = now();
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO jobs (id,kind,queue_name,idempotency_key,payload_json,state,attempts,available_at,created_at,updated_at) VALUES (?,?,?,?,?,'queued',0,?,?,?)",
  )
    .bind(
      id,
      input.kind,
      input.queueName,
      input.idempotencyKey,
      JSON.stringify(input.payload),
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    const existing = await env.DB.prepare(
      "SELECT id FROM jobs WHERE idempotency_key = ?",
    )
      .bind(input.idempotencyKey)
      .first<{ id: string }>();
    return { id: existing?.id ?? id, created: false };
  }
  await (
    input.queueName === "jobs" ? env.JOBS_QUEUE : env.NOTIFICATIONS_QUEUE
  ).send({ jobId: id });
  return { id, created: true };
}
