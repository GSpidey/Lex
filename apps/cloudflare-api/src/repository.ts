import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { authChallenges } from "@lex/d1";
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
  const row = await env.DB.prepare(
    `SELECT s.id session_id,s.user_id,s.active_role,s.last_step_up_at,u.role legacy_role
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.access_token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='active'`,
  )
    .bind(tokenHash, now())
    .first<{
      session_id: string;
      user_id: string;
      active_role: string | null;
      last_step_up_at: string | null;
      legacy_role: string;
    }>();
  if (!row) return null;
  const assignments = await env.DB.prepare(
    "SELECT role FROM user_role_assignments WHERE user_id=? AND status='active' ORDER BY role",
  )
    .bind(row.user_id)
    .all<{ role: AuthenticatedUser["role"] }>();
  const roles = assignments.results.map((item) => item.role);
  const legacyRole = canonicalRole(row.legacy_role);
  if (roles.length === 0) roles.push(legacyRole);
  const activeRole = roles.includes(
    row.active_role as AuthenticatedUser["role"],
  )
    ? (row.active_role as AuthenticatedUser["role"])
    : (roles[0] ?? legacyRole);
  await env.DB.prepare(
    "UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?",
  )
    .bind(now(), row.session_id, new Date(Date.now() - 300_000).toISOString())
    .run();
  return {
    id: row.user_id,
    role: activeRole,
    roles,
    sessionId: row.session_id,
    ...(row.last_step_up_at ? { lastStepUpAt: row.last_step_up_at } : {}),
  };
}

export function canonicalRole(role: string): AuthenticatedUser["role"] {
  if (role === "admin") return "operations";
  if (role === "super_admin") return "owner";
  if (["client", "lawyer", "operations", "owner"].includes(role))
    return role as AuthenticatedUser["role"];
  return "client";
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
