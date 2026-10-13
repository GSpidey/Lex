import { describe, expect, it } from "vitest";
import {
  practiceAreaCatalogue,
  publicLegalDocuments,
  serviceCatalogue,
} from "./index.js";

describe("portable public services", () => {
  it("retains nationwide full-spectrum catalogue and shared search", () => {
    expect(practiceAreaCatalogue().count).toBe(52);
    expect(practiceAreaCatalogue(" TENANCY ")).toEqual(
      practiceAreaCatalogue("tenancy"),
    );
    expect(practiceAreaCatalogue("no-such-area").count).toBe(0);
    expect(
      serviceCatalogue().every(
        (service) => service.jurisdiction.states.length === 37,
      ),
    ).toBe(true);
    expect(serviceCatalogue("unknown")).toEqual([]);
  });
  it("passes one point in time and language to the repository without exposing extras", async () => {
    const result = await publicLegalDocuments(
      {
        effectiveDocuments: async (language, at) => {
          expect(language).toBe("pcm");
          expect(at).toBe("2026-10-13T00:00:00.000Z");
          return [
            {
              id: "doc",
              version_id: "doc-v1",
              code: "terms",
              title: "Terms",
              version: 1,
              language,
              status: "published",
              content_markdown: "Terms",
              content_hash: null,
              effective_at: at,
              acceptance_kind: "agreement",
              private_reviewer: "never-public",
            },
          ];
        },
      },
      "pcm",
      "2026-10-13T00:00:00.000Z",
    );
    expect(result.items[0]).not.toHaveProperty("private_reviewer");
    expect(result.stagingDraftsVisible).toBe(false);
  });
});
