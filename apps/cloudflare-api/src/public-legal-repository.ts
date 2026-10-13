import type {
  EffectiveLegalDocument,
  PublicLegalRepository,
} from "@lex/platform-core";

export class D1PublicLegalRepository implements PublicLegalRepository {
  constructor(private readonly db: D1Database) {}

  async effectiveDocuments(
    language: string,
    at: string,
  ): Promise<EffectiveLegalDocument[]> {
    const result = await this.db
      .prepare(
        `
      SELECT d.id,v.id version_id,d.code,d.title,v.version,v.language,v.status,
             v.content_markdown,v.content_hash,v.effective_at,d.acceptance_kind
      FROM legal_document_versions v JOIN legal_documents d ON d.id=v.document_id
      WHERE d.visibility='public' AND v.language=? AND v.status='published' AND v.effective_at<=?
        AND NOT EXISTS (SELECT 1 FROM legal_document_versions newer
          WHERE newer.document_id=v.document_id AND newer.language=v.language
            AND newer.status='published' AND newer.effective_at<=? AND newer.version>v.version)
      ORDER BY d.title,d.id`,
      )
      .bind(language, at, at)
      .all<EffectiveLegalDocument>();
    return result.results;
  }
}
