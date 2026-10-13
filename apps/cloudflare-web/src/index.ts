interface Env {
  ASSETS: Fetcher;
  API: Fetcher;
  REALTIME: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/v1" || url.pathname.startsWith("/v1/"))
      return env.API.fetch(request);
    if (
      url.pathname === "/realtime/v1" ||
      url.pathname.startsWith("/realtime/v1/")
    ) {
      url.pathname = url.pathname.slice("/realtime".length);
      return env.REALTIME.fetch(new Request(url, request));
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "content-security-policy",
      "default-src 'self'; connect-src 'self' https://*.workers.dev; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (url.pathname.startsWith("/_next/static/"))
      headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
