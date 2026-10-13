import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export async function applyMigrations(
  pool: Pool,
  directory: string,
): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1538879, 1)");
    await client.query("CREATE SCHEMA IF NOT EXISTS lex");
    await client.query(
      "CREATE TABLE IF NOT EXISTS lex.schema_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const files = (await readdir(directory))
      .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file))
      .sort();
    if (!files.length) throw new Error("No versioned Lex migrations found");
    const recorded = await client.query<{ name: string; sha256: string }>(
      "SELECT name,sha256 FROM lex.schema_migrations ORDER BY name",
    );
    if (recorded.rows.some((row) => !files.includes(row.name)))
      throw new Error(
        "Database contains a migration missing from this release",
      );
    for (const file of files) {
      const sql = (await readFile(join(directory, file), "utf8")).replaceAll(
        "\r\n",
        "\n",
      );
      const hash = createHash("sha256").update(sql).digest("hex");
      const existing = recorded.rows.find((row) => row.name === file);
      if (existing) {
        if (existing.sha256 !== hash)
          throw new Error("Applied migration checksum changed");
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO lex.schema_migrations(name,sha256) VALUES($1,$2)",
        [file, hash],
      );
      applied.push(file);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
