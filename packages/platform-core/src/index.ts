import {
  NIGERIA_STATES,
  PRACTICE_AREAS,
  serviceForPracticeArea,
} from "@lex/jurisdictions";

// Runtime-independent boundary: neither Worker bindings nor SQL belong here.
export interface EffectiveLegalDocument {
  id: string;
  version_id: string;
  code: string;
  title: string;
  version: number;
  language: string;
  status: string;
  content_markdown: string;
  content_hash: string | null;
  effective_at: string | null;
  acceptance_kind: string;
}

export interface PublicLegalRepository {
  effectiveDocuments(
    language: string,
    at: string,
  ): Promise<EffectiveLegalDocument[]>;
}

export async function publicLegalDocuments(
  repository: PublicLegalRepository,
  language = "en",
  at = new Date().toISOString(),
) {
  const documents = await repository.effectiveDocuments(language, at);
  // Explicit projection prevents private approval metadata leaking via SELECT *.
  return {
    items: documents.map((v) => ({
      id: v.id,
      version_id: v.version_id,
      code: v.code,
      title: v.title,
      version: v.version,
      language: v.language,
      status: v.status,
      content_markdown: v.content_markdown,
      content_hash: v.content_hash,
      effective_at: v.effective_at,
      acceptance_kind: v.acceptance_kind,
    })),
    stagingDraftsVisible: false,
  };
}

export function practiceAreaCatalogue(search = "") {
  const query = search.trim().toLowerCase();
  const items = PRACTICE_AREAS.filter(
    (item) =>
      !query ||
      [item.name, item.group, item.description, ...item.keywords].some(
        (value) => value.toLowerCase().includes(query),
      ),
  );
  return {
    countryCode: "NG",
    stagingAvailability: "nationwide",
    count: items.length,
    groups: [...new Set(items.map((item) => item.group))].map((group) => ({
      group,
      items: items.filter((item) => item.group === group),
    })),
  };
}

export function serviceCatalogue(code?: string) {
  return (
    code ? PRACTICE_AREAS.filter((item) => item.code === code) : PRACTICE_AREAS
  ).map((item) => ({
    ...serviceForPracticeArea(item.code),
    jurisdiction: {
      countryCode: "NG",
      states: NIGERIA_STATES.map(([stateCode, name]) => ({
        stateCode,
        name,
        status: "active",
      })),
    },
    syntheticStagingOnly: true,
  }));
}
