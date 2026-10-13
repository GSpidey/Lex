import { serve } from "@hono/node-server";
import { Server } from "node:http";
import { Pool } from "pg";
import { databaseConfig } from "./config.js";
import { PostgresPublicLegalRepository } from "./public-legal-repository.js";
import { createNodeApp } from "./app.js";

const pool = new Pool({
  ...databaseConfig(),
  options:
    "-c search_path=lex,public -c timezone=UTC -c default_transaction_read_only=on",
});
pool.on("error", () =>
  console.error(JSON.stringify({ event: "database_connection_failed" })),
);
const app = createNodeApp({
  legal: new PostgresPublicLegalRepository(pool),
  allowedOrigins: (
    process.env.LEX_CORS_ORIGINS ?? "http://127.0.0.1:4180"
  ).split(","),
  health: async () => {
    try {
      await pool.query("SELECT 1 FROM lex.schema_migrations LIMIT 1");
      return true;
    } catch {
      return false;
    }
  },
});
const server = serve({ fetch: app.fetch, hostname: "0.0.0.0", port: 4000 });
if (server instanceof Server) {
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
}
console.info(
  JSON.stringify({
    event: "lex_node_started",
    port: 4000,
    migrationStage: "public-read-port",
  }),
);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 15_000).unref();
  server.close(() => {
    void pool.end().then(() => {
      clearTimeout(timeout);
      process.exit(0);
    });
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
