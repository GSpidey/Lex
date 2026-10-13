import { describe, expect, it } from "vitest";
import { createNodeApp } from "../src/app.js";

const app = createNodeApp({
  legal: { effectiveDocuments: async () => [] },
  health: async () => true,
  allowedOrigins: ["http://127.0.0.1:4180"],
});
describe("isolated Node API", () => {
  it("serves the shared catalogue and labels migration health truthfully", async () => {
    const catalogue = await (
      await app.request("/v1/catalog/practice-areas")
    ).json();
    expect(catalogue.count).toBe(52);
    const health = await (await app.request("/v1/health")).json();
    expect(health.cutoverReady).toBe(false);
  });
  it("does not forward unmigrated writes or allow foreign origins", async () => {
    expect((await app.request("/v1/payments", { method: "POST" })).status).toBe(
      501,
    );
    expect(
      (
        await app.request("/v1/legal/documents", {
          headers: { origin: "https://unrelated.example" },
        })
      ).status,
    ).toBe(403);
    const response = await app.request("/v1/legal/documents");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      items: [],
      stagingDraftsVisible: false,
    });
  });
});
