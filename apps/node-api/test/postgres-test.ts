import assert from "node:assert/strict";
import { Pool } from "pg";
import { databaseConfig } from "../src/config.js";
import { applyMigrations } from "../src/migrations.js";
import { PostgresPublicLegalRepository } from "../src/public-legal-repository.js";
import { publicLegalDocuments } from "@lex/platform-core";

// All fixtures live inside a rolled-back transaction on the isolated Lex DB.
// Never truncate or reset a database to run tests.
const pool = new Pool(databaseConfig());
try {
  assert.deepEqual(await applyMigrations(pool, "migrations"), []);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const prefix = `synthetic-${crypto.randomUUID()}`;
    const at = "2026-10-13T12:00:00.000Z";
    const before = await new PostgresPublicLegalRepository(
      client,
    ).effectiveDocuments("en", at);
    for (const [suffix, visibility] of [
      ["public", "public"],
      ["private", "owners"],
    ]) {
      const doc = `${prefix}-${suffix}`;
      await client.query(
        "INSERT INTO lex.legal_documents(id,code,title,audience,visibility,created_at,updated_at) VALUES($1,$1,$1,'all',$2,$3,$3)",
        [doc, visibility, at],
      );
      for (const [version, status, effective] of [
        [1, "published", "2026-01-01T00:00:00.000Z"],
        [2, "published", "2026-10-01T00:00:00.000Z"],
        [3, "draft", null],
        [4, "published", "2099-01-01T00:00:00.000Z"],
      ] as const) {
        await client.query(
          "INSERT INTO lex.legal_document_versions(id,document_id,version,status,content_markdown,effective_at,created_at,updated_at) VALUES($1,$2,$3,$4,'Synthetic test content',$5,$6,$6)",
          [`${doc}-v${version}`, doc, version, status, effective, at],
        );
      }
    }
    const response = await publicLegalDocuments(
      new PostgresPublicLegalRepository(client),
      "en",
      at,
    );
    const own = response.items.filter((item) => item.id.startsWith(prefix));
    assert.equal(own.length, 1);
    assert.equal(own[0]?.version, 2);
    assert.equal(own[0]?.effective_at, "2026-10-01T00:00:00.000Z");
    assert.equal(response.items.length, before.length + 1);
    assert.equal(
      (
        await publicLegalDocuments(
          new PostgresPublicLegalRepository(client),
          "yo",
          at,
        )
      ).items.some((item) => item.id.startsWith(prefix)),
      false,
    );
    for (const sql of [
      "UPDATE lex.legal_document_versions SET content_markdown='changed' WHERE id=$1",
      "DELETE FROM lex.legal_document_versions WHERE id=$1",
      "UPDATE lex.legal_document_versions SET status='draft' WHERE id=$1",
    ]) {
      await client.query("SAVEPOINT immutable_check");
      await assert.rejects(client.query(sql, [`${prefix}-public-v2`]));
      await client.query("ROLLBACK TO SAVEPOINT immutable_check");
    }
    await client.query("ROLLBACK");
    assert.deepEqual(
      await new PostgresPublicLegalRepository(client).effectiveDocuments(
        "en",
        at,
      ),
      before,
    );
    console.info(
      JSON.stringify({
        event: "postgres_contract_tests_passed",
        checks: [
          "migration_rerun",
          "stable_text_ids",
          "effective_version",
          "draft_private_future_isolation",
          "language_isolation",
          "immutable_content",
          "no_delete",
          "no_unpublish",
          "transaction_rollback",
        ],
      }),
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
} finally {
  await pool.end();
}
