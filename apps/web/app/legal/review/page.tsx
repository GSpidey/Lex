"use client";
import { useEffect, useState } from "react";
import { api, readSession, type Session } from "../../../lib/api";

type Doc = {
  id: string;
  document_id: string;
  title: string;
  version: number;
  language: string;
  status: string;
  content_markdown: string;
  content_hash: string;
  unresolved_fields_json: string;
  visibility: string;
};
type Packet = {
  id: string;
  requested_by: string;
  reviewer_id: string;
  packet_hash: string;
  state: string;
  expires_at: string;
  claimed_at: string | null;
};
type Event = {
  id: string;
  kind: string;
  body: string;
  signed_name?: string;
  occurred_at: string;
};
type Detail = { packet: Packet; items: Doc[]; events: Event[] };
type Reviewer = { id: string; display_name: string; roles: string };

export default function ReviewPage() {
  const [session, setSession] = useState<Session | null>(null),
    [mfa, setMfa] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [documents, setDocuments] = useState<Doc[]>([]),
    [packets, setPackets] = useState<Packet[]>([]),
    [reviewers, setReviewers] = useState<Reviewer[]>([]),
    [reviewer, setReviewer] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null),
    [requestId, setRequestId] = useState(""),
    [invitation, setInvitation] = useState(""),
    [comment, setComment] = useState(""),
    [name, setName] = useState(""),
    [intent, setIntent] = useState(false),
    [queued, setQueued] = useState(false),
    [shareLink, setShareLink] = useState("");
  const [editing, setEditing] = useState<Doc | null>(null),
    [text, setText] = useState("");
  useEffect(() => {
    setSession(readSession());
    const params = new URLSearchParams(window.location.hash.slice(1));
    setRequestId(params.get("request") ?? "");
    setInvitation(params.get("token") ?? "");
  }, []);
  const token = session?.accessToken;
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The request could not be completed. Your draft is preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const [docs, list, users] = await Promise.all([
      api<{ items: Doc[] }>("/owner/legal-reviews/documents", {}, token),
      api<{ items: Packet[] }>("/owner/legal-reviews", {}, token),
      api<Reviewer[]>("/owner/users", {}, token),
    ]);
    setDocuments(docs.items);
    setPackets(list.items);
    setReviewers(
      users.filter(
        (u) =>
          u.id !== session?.user.id &&
          u.roles?.split(",").includes("owner") &&
          u.roles.split(",").includes("lawyer"),
      ),
    );
  }
  async function open(id: string) {
    setDetail(
      await api<Detail>(
        `/owner/legal-reviews/${encodeURIComponent(id)}`,
        {},
        token,
      ),
    );
    setRequestId(id);
    setComment("");
    setIntent(false);
    setQueued(false);
    setShareLink("");
  }
  async function unlock() {
    await api(
      "/auth/step-up",
      { method: "POST", body: JSON.stringify({ code: mfa }) },
      token,
    );
    setMfa("");
    await load();
    setReady(true);
    if (requestId) await open(requestId);
  }
  async function decide(
    kind: "comment" | "approved" | "changes_requested" | "revoked",
  ) {
    if (!detail) return;
    await api(
      `/owner/legal-reviews/${detail.packet.id}/events`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          kind,
          body: comment,
          packetHash: detail.packet.packet_hash,
          ...(kind === "approved" ? { signedName: name, intent } : {}),
        }),
      },
      token,
    );
    await open(detail.packet.id);
    await load();
  }
  async function receipt() {
    if (!detail) return;
    const data = await api(
      `/owner/legal-reviews/${detail.packet.id}/receipt`,
      {},
      token,
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `lex-review-${detail.packet.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const latest = documents.filter(
    (d) =>
      !documents.some(
        (other) =>
          other.document_id === d.document_id &&
          other.language === d.language &&
          other.version > d.version,
      ),
  );
  return (
    <main className="legal-shell">
      <nav aria-label="Lex">
        <a href="/">Workspace</a>
        <a href="/legal/">Public Legal Centre</a>
      </nav>
      <p className="eyebrow">Owner workspace · private review</p>
      <h1>Review the exact words</h1>
      <p>
        Each packet preserves its document versions and hashes. Reading a
        document or opening an invitation never counts as approval.
      </p>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {!session ||
      (session.user.activeRole !== "owner" && session.user.role !== "owner") ? (
        <section className="legal-card">
          <h2>Use your Owner workspace</h2>
          <p>
            Sign in, enroll MFA if prompted, and select your assigned Owner
            role. Regular clients cannot access this area.
          </p>
          <a href="/" target="_blank" rel="noopener noreferrer">
            Open sign-in in another tab
          </a>
          <button
            className="secondary"
            onClick={() => {
              setSession(readSession());
              setReady(false);
            }}
          >
            Continue after signing in
          </button>
        </section>
      ) : (
        <>
          <form
            className="legal-card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(unlock);
            }}
          >
            <label htmlFor="review-mfa">Confirm your authenticator code</label>
            <div className="legal-inline">
              <input
                id="review-mfa"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={mfa}
                onChange={(e) => setMfa(e.target.value)}
                placeholder="6-digit code"
              />
              <button disabled={busy}>
                {busy
                  ? "Working…"
                  : ready
                    ? "Renew verification"
                    : "Unlock review"}
              </button>
            </div>
            <p className="legal">
              Verification lasts ten minutes. Your comments remain here if you
              need to renew it.
            </p>
          </form>
          {ready ? (
            <>
              <section className="legal-card">
                <h2>Your review packets</h2>
                {packets.length ? (
                  packets.map((p) => (
                    <button
                      className="secondary"
                      key={p.id}
                      disabled={busy}
                      onClick={() => void run(() => open(p.id))}
                    >
                      {p.id.slice(0, 8)} · {p.state.replaceAll("_", " ")}
                    </button>
                  ))
                ) : (
                  <p>
                    No packets yet. Select document versions below to request a
                    review.
                  </p>
                )}
              </section>
              {detail ? (
                <section className="legal-card">
                  <h2>Packet {detail.packet.id.slice(0, 8)}</h2>
                  <p className="pill">
                    {detail.packet.state.replaceAll("_", " ")}
                  </p>
                  <p>
                    Invitation expires{" "}
                    {new Date(detail.packet.expires_at).toLocaleString()}
                  </p>
                  {detail.items.map((d) => (
                    <details className="legal-document" key={d.id}>
                      <summary>
                        {d.title} · v{d.version} · {d.language}
                      </summary>
                      {d.unresolved_fields_json !== "[]" ? (
                        <p className="notice">
                          Unresolved details:{" "}
                          {JSON.parse(d.unresolved_fields_json).join(", ")}
                        </p>
                      ) : null}
                      <pre className="legal-copy">{d.content_markdown}</pre>
                      <small className="legal-hash">
                        SHA-256: {d.content_hash}
                      </small>
                    </details>
                  ))}
                  {detail.packet.state === "pending" &&
                  detail.packet.reviewer_id === session.user.id &&
                  !detail.packet.claimed_at ? (
                    <>
                      <p>
                        Claim the invitation addressed to your account before
                        recording a decision.
                      </p>
                      <button
                        disabled={busy || !invitation}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              `/owner/legal-reviews/${detail.packet.id}/claim`,
                              {
                                method: "POST",
                                body: JSON.stringify({ token: invitation }),
                              },
                              token,
                            );
                            setInvitation("");
                            window.history.replaceState(
                              null,
                              "",
                              window.location.pathname,
                            );
                            await open(detail.packet.id);
                          })
                        }
                      >
                        Claim secure invitation
                      </button>
                      {!invitation ? (
                        <p>
                          Open your secure invitation link, or ask the
                          requesting owner to resend it.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  {detail.packet.state === "pending" ? (
                    <>
                      <label htmlFor="review-comment">
                        Comment or reason for your decision
                      </label>
                      <textarea
                        id="review-comment"
                        rows={5}
                        value={comment}
                        maxLength={8000}
                        onChange={(e) => setComment(e.target.value)}
                      />
                      <button
                        disabled={busy || !comment.trim()}
                        onClick={() => void run(() => decide("comment"))}
                      >
                        Add comment
                      </button>
                      {detail.packet.reviewer_id === session.user.id &&
                      detail.packet.claimed_at ? (
                        <>
                          <label htmlFor="signing-name">
                            Your full legal name
                          </label>
                          <input
                            id="signing-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                          />
                          <label className="legal-check">
                            <input
                              type="checkbox"
                              checked={intent}
                              onChange={(e) => setIntent(e.target.checked)}
                            />
                            I intend to approve these exact document versions in
                            my legal-review capacity. This is not execution for
                            both companies or public publication.
                          </label>
                          <button
                            disabled={
                              busy ||
                              !intent ||
                              name.trim().length < 2 ||
                              !comment.trim()
                            }
                            onClick={() => void run(() => decide("approved"))}
                          >
                            Approve exact versions
                          </button>
                          <button
                            className="secondary"
                            disabled={busy || !comment.trim()}
                            onClick={() =>
                              void run(() => decide("changes_requested"))
                            }
                          >
                            Request changes
                          </button>
                        </>
                      ) : null}
                      {detail.packet.requested_by === session.user.id ? (
                        <>
                          <button
                            className="secondary"
                            disabled={busy || !comment.trim()}
                            onClick={() => void run(() => decide("revoked"))}
                          >
                            Revoke review request
                          </button>
                          {!detail.packet.claimed_at ? (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await api(
                                    `/owner/legal-reviews/${detail.packet.id}/invite`,
                                    { method: "POST", body: "{}" },
                                    token,
                                  );
                                  setQueued(true);
                                  setShareLink("");
                                })
                              }
                            >
                              Send secure review email
                            </button>
                          ) : null}
                          {!detail.packet.claimed_at ? (
                            <>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    const invite = await api<{
                                      invitationToken: string;
                                    }>(
                                      `/owner/legal-reviews/${detail.packet.id}/invitation-link`,
                                      { method: "POST", body: "{}" },
                                      token,
                                    );
                                    setShareLink(
                                      `${window.location.origin}/legal/review/#request=${detail.packet.id}&token=${invite.invitationToken}`,
                                    );
                                    setQueued(false);
                                  })
                                }
                              >
                                Prepare private invitation link
                              </button>
                              <p className="legal">
                                If email is unavailable, share this link
                                privately with the assigned reviewer through a
                                trusted channel. Generating or sending a new
                                invitation invalidates earlier links.
                              </p>
                            </>
                          ) : null}
                          {shareLink ? (
                            <label>
                              Private review invitation
                              <input
                                readOnly
                                value={shareLink}
                                onFocus={(e) => e.currentTarget.select()}
                                aria-label="Private review invitation"
                              />
                              <button
                                className="secondary"
                                onClick={() =>
                                  void run(async () => {
                                    await navigator.clipboard.writeText(
                                      shareLink,
                                    );
                                  })
                                }
                              >
                                Copy invitation link
                              </button>
                            </label>
                          ) : null}
                          {queued ? (
                            <p role="status">
                              Invitation queued. This is not confirmation of
                              delivery.
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {detail.packet.state === "approved" &&
                  detail.packet.requested_by === session.user.id &&
                  !detail.events.some((e) => e.kind === "published") ? (
                    <>
                      <p>
                        Publishing makes public documents effective and visible
                        without sign-in. It requires your separate Owner action;
                        unresolved fields cannot be published.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Publish these approved document versions as effective policies?",
                            )
                          )
                            void run(async () => {
                              await api(
                                `/owner/legal-reviews/${detail.packet.id}/publish`,
                                { method: "POST", body: "{}" },
                                token,
                              );
                              await open(detail.packet.id);
                              await load();
                            });
                        }}
                      >
                        Publish approved versions
                      </button>
                    </>
                  ) : null}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(receipt)}
                  >
                    Download review record
                  </button>
                  <h3>Review history</h3>
                  {detail.events.map((e) => (
                    <article key={e.id}>
                      <strong>{e.kind.replaceAll("_", " ")}</strong>
                      <p>{e.body}</p>
                      {e.signed_name ? <p>Signed: {e.signed_name}</p> : null}
                      <small>{new Date(e.occurred_at).toLocaleString()}</small>
                    </article>
                  ))}
                </section>
              ) : null}
              <section className="legal-card">
                <h2>Prepare a new review</h2>
                <p>
                  Choose the latest drafts. Revisions require a new packet and a
                  fresh approval.
                </p>
                {latest.map((d) => (
                  <div className="legal-draft" key={d.id}>
                    <label className="legal-check">
                      <input
                        type="checkbox"
                        disabled={
                          !["draft", "legal_review"].includes(d.status) || busy
                        }
                        checked={selected.includes(d.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, d.id]
                              : selected.filter((id) => id !== d.id),
                          )
                        }
                      />
                      {d.title} · v{d.version} · {d.status.replaceAll("_", " ")}{" "}
                      {d.visibility === "owners" ? "· private agreement" : ""}
                    </label>
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditing(d);
                        setText(d.content_markdown);
                      }}
                    >
                      Read / revise
                    </button>
                  </div>
                ))}
                <label htmlFor="legal-reviewer">
                  Different Owner with Lawyer role
                </label>
                <select
                  id="legal-reviewer"
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                >
                  <option value="">Select legal reviewer</option>
                  {reviewers.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.display_name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy || !selected.length || !reviewer}
                  onClick={() =>
                    void run(async () => {
                      const p = await api<{ id: string }>(
                        "/owner/legal-reviews",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            reviewerId: reviewer,
                            versionIds: selected,
                          }),
                        },
                        token,
                      );
                      setSelected([]);
                      await load();
                      await open(p.id);
                    })
                  }
                >
                  Create version-locked packet
                </button>
              </section>
              {editing ? (
                <section className="legal-card">
                  <h2>{editing.title} · new revision</h2>
                  <p>
                    Existing versions and approvals stay unchanged. Resolve the
                    bracketed fields with verified details before publication.
                  </p>
                  <label htmlFor="legal-editor">Document text (Markdown)</label>
                  <textarea
                    id="legal-editor"
                    className="legal-editor"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={22}
                  />
                  <button
                    disabled={
                      busy ||
                      text.trim().length < 100 ||
                      text === editing.content_markdown
                    }
                    onClick={() =>
                      void run(async () => {
                        await api(
                          `/owner/legal-reviews/documents/${editing.document_id}/versions`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              content: text,
                              language: editing.language,
                              baseVersion: editing.version,
                            }),
                          },
                          token,
                        );
                        await load();
                        setEditing(null);
                      })
                    }
                  >
                    Save as new draft version
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setEditing(null)}
                  >
                    Close editor
                  </button>
                </section>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
