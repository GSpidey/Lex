import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("realtime worker", () => {
  it("reports health without creating a room", async () => {
    const response = await SELF.fetch("https://example.test/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "lex-staging-realtime",
    });
  });
});
