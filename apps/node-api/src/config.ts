import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

export function databaseConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  const passwordFile = environment.LEX_POSTGRES_PASSWORD_FILE;
  if (!passwordFile) throw new Error("LEX_POSTGRES_PASSWORD_FILE is required");
  const password = readFileSync(passwordFile, "utf8").trim();
  if (password.length < 32) throw new Error("Database secret is too short");
  const database = environment.LEX_POSTGRES_DATABASE ?? "lex";
  if (database !== "lex" && !/^lex_test_[a-z0-9_]+$/u.test(database))
    throw new Error("Only the isolated Lex database is allowed");
  return {
    host: environment.LEX_POSTGRES_HOST ?? "postgres",
    port: 5432,
    database,
    user: "lex",
    password,
    max: 8,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    application_name: "lex-node-api",
    options: "-c search_path=lex,public -c timezone=UTC",
  };
}
