const apiUrl = process.env.LEX_STAGING_API_URL?.replace(/\/$/u, "");
const token = process.env.LEX_FOUNDER_BOOTSTRAP_TOKEN;
if (!apiUrl || !token)
  throw new Error(
    "LEX_STAGING_API_URL and LEX_FOUNDER_BOOTSTRAP_TOKEN are required",
  );
const started = await fetch(`${apiUrl}/internal/openai-smoke`, {
  method: "POST",
  headers: { "x-founder-bootstrap-token": token },
});
const created = await started.json();
if (!started.ok)
  throw new Error(
    created.message ?? `OpenAI smoke start failed (${started.status})`,
  );
let verified = false;
for (let attempt = 0; attempt < 15; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const response = await fetch(
    `${apiUrl}/internal/openai-smoke/${created.conversationId}`,
    {
      headers: { "x-founder-bootstrap-token": token },
    },
  );
  const status = await response.json();
  if (!response.ok)
    throw new Error(
      status.message ?? `OpenAI smoke status failed (${response.status})`,
    );
  if (status.job_state === "completed") {
    console.log(
      JSON.stringify({
        verified: true,
        model: status.model,
        promptVersion: status.prompt_version,
        schemaVersion: status.schema_version,
        latencyMs: status.latency_ms,
        requiresHumanReview: Boolean(status.requires_human_review),
        tokenUseRecorded: Boolean(status.token_use_json),
      }),
    );
    verified = true;
    break;
  }
  if (status.job_state === "dead_letter")
    throw new Error(
      `OpenAI smoke job reached dead letter: ${status.last_error ?? "unknown"}`,
    );
}
if (!verified)
  throw new Error("OpenAI smoke job did not complete within 30 seconds");
