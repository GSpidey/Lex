import { describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";

function fetcher(handler: (request: Request) => Promise<Response>): Fetcher {
  return { fetch: handler } as unknown as Fetcher;
}

describe("Lex staging web gateway", () => {
  it("routes API requests through the API service binding", async () => {
    const apiFetch = vi.fn(async (request: Request) =>
      Response.json({ pathname: new URL(request.url).pathname }),
    );
    const response = await worker.fetch(
      new Request("https://lex.example/v1/health"),
      {
        API: fetcher(apiFetch),
        REALTIME: fetcher(async () => new Response("unused")),
        ASSETS: fetcher(async () => new Response("unused")),
      },
    );

    await expect(response.json()).resolves.toEqual({ pathname: "/v1/health" });
    expect(apiFetch).toHaveBeenCalledOnce();
  });

  it("removes the realtime prefix before using the realtime binding", async () => {
    const realtimeFetch = vi.fn(async (request: Request) =>
      Response.json({ pathname: new URL(request.url).pathname }),
    );
    const response = await worker.fetch(
      new Request("https://lex.example/realtime/v1/consultations/test"),
      {
        API: fetcher(async () => new Response("unused")),
        REALTIME: fetcher(realtimeFetch),
        ASSETS: fetcher(async () => new Response("unused")),
      },
    );

    await expect(response.json()).resolves.toEqual({
      pathname: "/v1/consultations/test",
    });
    expect(realtimeFetch).toHaveBeenCalledOnce();
  });
});
