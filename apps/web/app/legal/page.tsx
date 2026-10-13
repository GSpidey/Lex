"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Policy = {
  version_id: string;
  title: string;
  version: number;
  effective_at: string;
  content_markdown: string;
};
export default function LegalCentre() {
  const [items, setItems] = useState<Policy[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
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
        </details>
      ))}
      <p>
        <a href="/legal/review/">Owner document review</a>
      </p>
    </main>
  );
}
