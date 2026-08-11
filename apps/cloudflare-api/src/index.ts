import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import authRoutes from "./auth-routes.js";
import { corsGuard, requestContext } from "./middleware.js";
import { openApiDocument } from "./openapi.js";
import paymentRoutes from "./payment-routes.js";
import pilotRoutes from "./pilot-routes.js";
import fullSpectrumRoutes from "./full-spectrum-routes.js";
import type { Env, Variables } from "./types.js";
import webhookRoutes from "./webhook-routes.js";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("*", requestContext);
app.use("*", corsGuard);

app.get("/", (context) =>
  context.json({
    service: "lex-staging-api",
    version: "1.0.0",
    documentation: "/v1/openapi.json",
  }),
);
app.get("/v1/health", async (context) => {
  const started = Date.now();
  const result = await context.env.DB.prepare("SELECT 1 ok").first<{
    ok: number;
  }>();
  return context.json({
    status: result?.ok === 1 ? "ok" : "degraded",
    service: "lex-staging-api",
    environment: context.env.APP_ENV,
    database: result?.ok === 1 ? "reachable" : "unreachable",
    elapsedMs: Date.now() - started,
  });
});
app.get("/v1/openapi.json", (context) => context.json(openApiDocument));
app.route("/v1/auth", authRoutes);
app.route("/v1/payments", paymentRoutes);
app.route("/v1/webhooks", webhookRoutes);
app.route("/v1", fullSpectrumRoutes);
app.route("/v1", pilotRoutes);

app.notFound((context) =>
  context.json(
    { message: "Route not found", requestId: context.get("requestId") },
    404,
  ),
);
app.onError((error, context) => {
  if (error instanceof HTTPException) return error.getResponse();
  if (error instanceof SyntaxError)
    return context.json(
      {
        message: "Request body is invalid",
        requestId: context.get("requestId"),
      },
      400,
    );
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_failed",
      requestId: context.get("requestId"),
      name: error.name,
    }),
  );
  return context.json(
    {
      message: "Request could not be completed",
      requestId: context.get("requestId"),
    },
    500,
  );
});

export default app;
