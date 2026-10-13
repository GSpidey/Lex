import type { Pool, PoolClient } from "pg";
import type {
  EffectiveLegalDocument,
  PublicLegalRepository,
} from "@lex/platform-core";

export class PostgresPublicLegalRepository implements PublicLegalRepository {
  constructor(private readonly db: Pick<Pool | PoolClient, "query">) {}
  async effectiveDocuments(
    language: string,
    at: string,
  ): Promise<EffectiveLegalDocument[]> {
    const { rows } = await this.db.query<EffectiveLegalDocument>(
      `
      SELECT d.id,v.id version_id,d.code,d.title,v.version,v.language,v.status,
             v.content_markdown,v.content_hash,
             to_char(v.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') effective_at,
             d.acceptance_kind
      FROM lex.legal_document_versions v JOIN lex.legal_documents d ON d.id=v.document_id
      WHERE d.visibility='public' AND v.language=$1 AND v.status='published' AND v.effective_at<=$2::timestamptz
        AND NOT EXISTS (SELECT 1 FROM lex.legal_document_versions newer
          WHERE newer.document_id=v.document_id AND newer.language=v.language
            AND newer.status='published' AND newer.effective_at<=$2::timestamptz AND newer.version>v.version)
      ORDER BY d.title,d.id`,
      [language, at],
    );
    return rows;
  }
}
