import { Pool } from "pg";
import { databaseConfig } from "./config.js";
import { applyMigrations } from "./migrations.js";
const pool = new Pool(databaseConfig());
try {
  const applied = await applyMigrations(pool, "migrations");
  console.info(JSON.stringify({ event: "lex_migrations_complete", applied }));
} catch {
  console.error(
    JSON.stringify({
      event: "lex_migrations_failed",
      message:
        "Migration failed; transaction rolled back. Inspect the scoped database and release checksums.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
