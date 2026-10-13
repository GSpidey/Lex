// Narrow structural port keeps platform globals out of this helper's types.
interface ConsentDatabase {
  prepare(sql: string): {
    bind(...values: string[]): { first<T>(): Promise<T | null> };
  };
}

export type OptionalPurpose =
  "ai-routing-disclosure" | "electronic-communications";

export async function optionalProcessingAllowed(
  db: ConsentDatabase,
  userId: string,
  code: OptionalPurpose,
): Promise<boolean> {
  const latest = await db
    .prepare(
      `
    SELECT e.kind FROM legal_consent_events e
    JOIN legal_document_versions v ON v.id=e.document_version_id
    JOIN legal_documents d ON d.id=v.document_id
    WHERE e.user_id=? AND d.code=? ORDER BY e.rowid DESC LIMIT 1
  `,
    )
    .bind(userId, code)
    .first<{ kind: string }>();
  // Existing contextual staging consent is preserved until a document decision
  // exists. A withdrawal applies account-wide, across channels and versions.
  return latest?.kind !== "withdrawn";
}
