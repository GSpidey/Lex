"use client";
import { useEffect, useState } from "react";
import { api, readSession } from "../../lib/api";

type Policy = {
  code: string;
  version_id: string;
  title: string;
  version: number;
  effective_at: string;
  content_markdown: string;
  language: string;
  acceptance_kind:
    "agreement" | "acknowledgement" | "optional_consent" | "notice";
};
type Consent = {
  document_version_id: string;
  document_code: string;
  kind: "accepted" | "acknowledged" | "withdrawn";
  occurred_at: string;
};
export default function LegalCentre() {
  const [items, setItems] = useState<Policy[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [pending, setPending] = useState<string>();
  async function loadConsents() {
    const session = readSession();
    setSignedIn(Boolean(session));
    if (!session) {
      setConsents([]);
      return;
    }
    try {
      const result = await api<{ items: Consent[] }>(
        "/legal/acceptances",
        {},
        session.accessToken,
      );
      setConsents(result.items);
    } catch (e) {
      setConsentError(
        e instanceof Error
          ? e.message
          : "Sign in again to manage your choices.",
      );
    }
  }
  async function decide(item: Policy, withdraw: boolean) {
    const session = readSession();
    if (!session) {
      setConsentError("Sign in to save your choice.");
      return;
    }
    setPending(item.version_id);
    setConsentError("");
    try {
      await api(
        withdraw ? "/legal/withdrawals" : "/legal/acceptances",
        {
          method: "POST",
          body: JSON.stringify({
            documentVersionId: item.version_id,
            language: item.language,
            channel: "web",
            ...(!withdraw ? { accepted: true } : {}),
          }),
        },
        session.accessToken,
      );
      await loadConsents();
    } catch (e) {
      setConsentError(
        e instanceof Error
          ? e.message
          : "Your choice could not be saved. Try again.",
      );
    } finally {
      setPending(undefined);
    }
  }
  const latestPurpose = (code: string) =>
    consents.filter((event) => event.document_code === code).at(-1);
  const latest = (id: string) => {
    const document = items.find((item) => item.version_id === id);
    const purpose = document && latestPurpose(document.code);
    return document?.acceptance_kind === "optional_consent" &&
      purpose?.kind === "withdrawn"
      ? purpose
      : consents.filter((event) => event.document_version_id === id).at(-1);
  };
  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems(
        (await api<{ items: Policy[] }>("/legal/documents?language=en")).items,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load policies.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void loadConsents();
  }, []);
  return (
    <main className="legal-shell">
      <nav aria-label="Lex">
        <a href="/">Lex workspace</a>
        <a href="/support/">Support</a>
        <a href="/account-deletion/">Privacy requests</a>
      </nav>
      <p className="eyebrow">Lex Legal Centre</p>
      <h1>Policies, clearly explained</h1>
      <p>
        Read the effective terms and notices without signing in. New drafts do
        not replace an effective policy until publication.
      </p>
      {loading ? <p role="status">Loading policies…</p> : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => void load()}>Try again</button>
        </div>
      ) : null}
      {!loading && !error && !items.length ? (
        <p className="notice">
          No policies have been published yet. This private test release is not
          open for real legal matters. Draft documents are available to
          authorized owners for review.
        </p>
      ) : null}
      {items.map((item) => (
        <details className="legal-card" key={item.version_id}>
          <summary>
            {item.title} <span className="pill">Version {item.version}</span>
          </summary>
          <p>Effective {new Date(item.effective_at).toLocaleDateString()}</p>
          <pre className="legal-copy">{item.content_markdown}</pre>
          {signedIn && latest(item.version_id) ? (
            <p role="status">
              Your choice: {latest(item.version_id)!.kind} on{" "}
              {new Date(
                latest(item.version_id)!.occurred_at,
              ).toLocaleDateString()}
              .
            </p>
          ) : null}
          {signedIn &&
          item.acceptance_kind !== "notice" &&
          !["accepted", "acknowledged"].includes(
            latest(item.version_id)?.kind ?? "",
          ) ? (
            <button
              disabled={Boolean(pending)}
              onClick={() => void decide(item, false)}
            >
              {pending === item.version_id
                ? "Saving…"
                : item.acceptance_kind === "acknowledgement"
                  ? "I acknowledge this notice"
                  : item.acceptance_kind === "optional_consent"
                    ? "I consent to this optional processing"
                    : "I agree to these terms"}
            </button>
          ) : null}
          {signedIn &&
          item.acceptance_kind === "optional_consent" &&
          latestPurpose(item.code)?.kind === "accepted" ? (
            <>
              <p>
                Withdrawal applies across your account. Typed intake, sign-in
                and in-app access remain available. It does not cancel an
                engagement, erase required records or recall information already
                sent.
              </p>
              <button
                disabled={Boolean(pending)}
                onClick={() => void decide(item, true)}
              >
                {pending === item.version_id
                  ? "Saving…"
                  : "Withdraw optional consent"}
              </button>
            </>
          ) : null}
        </details>
      ))}
      {consentError ? <p role="alert">{consentError}</p> : null}
      <p>
        <a href="/legal/review/">Owner document review</a>
      </p>
    </main>
  );
}
