import { Hono } from "hono";
import {
  practiceAreaCatalogue,
  publicLegalDocuments,
  serviceCatalogue,
  type PublicLegalRepository,
} from "@lex/platform-core";

export function createNodeApp(dependencies: {
  legal: PublicLegalRepository;
  health: () => Promise<boolean>;
  allowedOrigins: readonly string[];
}) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    c.header("x-request-id", c.get("requestId"));
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "no-referrer");
    c.header("cache-control", "no-store");
    const origin = c.req.header("origin");
    if (origin && !dependencies.allowedOrigins.includes(origin))
      return c.json({ message: "Origin is not allowed" }, 403);
    if (origin) {
      c.header("access-control-allow-origin", origin);
      c.header("vary", "Origin");
    }
    if (c.req.method === "OPTIONS") {
      c.header("access-control-allow-methods", "GET, OPTIONS");
      return c.body(null, 204);
    }
    await next();
  });
  app.get("/v1/health", async (c) => {
    const healthy = await dependencies.health();
    return c.json(
      {
        status: healthy ? "ok" : "degraded",
        service: "lex-node-api",
        environment: "local",
        database: healthy ? "reachable" : "unreachable",
        migrationStage: "public-read-port",
        cutoverReady: false,
      },
      healthy ? 200 : 503,
    );
  });
  app.get("/v1/catalog/practice-areas", (c) =>
    c.json(practiceAreaCatalogue(c.req.query("q"))),
  );
  app.get("/v1/catalog/services", (c) =>
    c.json(serviceCatalogue(c.req.query("practiceAreaCode"))),
  );
  app.get("/v1/legal/documents", async (c) =>
    c.json(
      await publicLegalDocuments(
        dependencies.legal,
        c.req.query("language") ?? "en",
      ),
    ),
  );
  // No forwarding to staging: mixed-authority writes would corrupt migration guarantees.
  app.notFound((c) =>
    c.json(
      {
        message: "Route not migrated to this isolated Docker runtime",
        code: "RUNTIME_ROUTE_NOT_MIGRATED",
        requestId: c.get("requestId"),
      },
      501,
    ),
  );
  app.onError((error, c) => {
    console.error(
      JSON.stringify({
        event: "request_failed",
        name: error.name,
        requestId: c.get("requestId"),
      }),
    );
    return c.json(
      {
        message: "Request could not be completed",
        requestId: c.get("requestId"),
      },
      500,
    );
  });
  return app;
}
