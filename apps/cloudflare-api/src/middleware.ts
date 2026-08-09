import type { Context, MiddlewareHandler } from "hono";
import { sha256 } from "./crypto.js";
import { findActiveSession } from "./repository.js";
import type { Env, Variables } from "./types.js";

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

export const requestContext: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (context, next) => {
  const requestId = context.req.header("cf-ray") ?? crypto.randomUUID();
  context.set("requestId", requestId);
  await next();
  context.header("x-request-id", requestId);
  context.header("x-content-type-options", "nosniff");
  context.header("referrer-policy", "no-referrer");
  context.header(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );
  context.header("cache-control", "no-store");
};

export const corsGuard: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (context, next) => {
  const origin = context.req.header("origin");
  const allowed = new Set(
    context.env.CORS_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (origin && !allowed.has(origin))
    return context.json({ message: "Origin is not allowed" }, 403);
  if (origin) {
    context.header("access-control-allow-origin", origin);
    context.header("vary", "Origin");
    context.header(
      "access-control-allow-headers",
      "Authorization, Content-Type, X-Device-Id, X-File-Name, X-File-Sha256, Idempotency-Key",
    );
    context.header(
      "access-control-allow-methods",
      "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    );
  }
  if (context.req.method === "OPTIONS") return context.body(null, 204);
  await next();
};

export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (context, next) => {
  const authorization = context.req.header("authorization") ?? "";
  if (!authorization.startsWith("Bearer "))
    return context.json({ message: "Authentication required" }, 401);
  const user = await findActiveSession(
    context.env,
    await sha256(authorization.slice(7)),
  );
  if (!user)
    return context.json({ message: "Session is invalid or expired" }, 401);
  context.set("user", user);
  await next();
};

export function requireRole(
  ...roles: Variables["user"]["role"][]
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (context, next) => {
    const user = context.get("user");
    if (!roles.includes(user.role))
      return context.json(
        { message: "You do not have permission for this action" },
        403,
      );
    await next();
  };
}

export async function canAccessMatter(
  context: AppContext,
  matterId: string,
): Promise<boolean> {
  const user = context.get("user");
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (user.role === "client") {
    return Boolean(
      await context.env.DB.prepare(
        "SELECT 1 FROM matters WHERE id = ? AND client_user_id = ?",
      )
        .bind(matterId, user.id)
        .first(),
    );
  }
  return Boolean(
    await context.env.DB.prepare(
      "SELECT 1 FROM matters m JOIN lawyer_profiles l ON l.id = m.selected_lawyer_id WHERE m.id = ? AND l.user_id = ?",
    )
      .bind(matterId, user.id)
      .first(),
  );
}
