"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  api,
  clearSession,
  readSession,
  saveSession,
  type Session,
} from "@/lib/api";

type Matter = {
  id: string;
  reference: string;
  state: string;
  urgency: string;
  state_code: string;
  version: number;
  due_at?: string;
};
type Lawyer = {
  id: string;
  display_name: string;
  supreme_court_number: string;
  year_of_call: number;
  verification_status: string;
  available: number;
  urgent_available: number;
  version: number;
};
type Job = {
  id: string;
  kind: string;
  queue_name: string;
  state: string;
  attempts: number;
  last_error?: string;
  created_at: string;
};
type Privacy = {
  id: string;
  type: string;
  status: string;
  due_at: string;
  created_at: string;
};
type Audit = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
};
type MatterDetail = Matter & {
  structuredSummary?: { summary?: string; facts?: string[] };
  messages: Array<{ id: string; body: string; created_at: string }>;
  evidence: Array<{ id: string; file_name: string; status: string }>;
};

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());

export default function Workspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState("+234");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [preAuth, setPreAuth] = useState("");
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [mfaSecret, setMfaSecret] = useState("");
  const [tab, setTab] = useState<
    "matters" | "lawyers" | "jobs" | "privacy" | "audits"
  >("matters");
  const [matters, setMatters] = useState<Matter[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [privacy, setPrivacy] = useState<Privacy[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selected, setSelected] = useState<MatterDetail | null>(null);
  const [assessment, setAssessment] = useState({
    title: "",
    body: "",
    limitations: "",
    nextSteps: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setSession(readSession());
  }, []);
  useEffect(() => {
    if (session) void loadWorkspace(session);
  }, [session]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  async function loadWorkspace(active = session) {
    if (!active) return;
    await run(async () => {
      const list = await api<Matter[]>("/matters", {}, active.accessToken);
      setMatters(list);
      if (["admin", "super_admin"].includes(active.user.role)) {
        const [lawyerRows, jobRows, privacyRows, auditRows] = await Promise.all(
          [
            api<Lawyer[]>("/admin/lawyers", {}, active.accessToken),
            api<Job[]>("/admin/jobs", {}, active.accessToken),
            api<Privacy[]>("/admin/privacy", {}, active.accessToken),
            api<Audit[]>("/admin/audits", {}, active.accessToken),
          ],
        );
        setLawyers(lawyerRows);
        setJobs(jobRows);
        setPrivacy(privacyRows);
        setAudits(auditRows);
      }
    });
  }
  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<{ challengeId: string; devCode?: string }>(
        "/auth/otp/request",
        {
          method: "POST",
          body: JSON.stringify({
            channel: "whatsapp",
            phone,
            purpose: "sign_in",
            locale: "en",
          }),
        },
      );
      setChallengeId(result.challengeId);
      if (result.devCode) setCode(result.devCode);
      setMessage("A verification code was sent through WhatsApp.");
    });
  }
  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<
        Session & {
          mfaSetupRequired?: boolean;
          mfaRequired?: boolean;
          preAuthToken?: string;
        }
      >("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          challengeId,
          code,
          deviceName: "Lex web workspace",
        }),
      });
      if (result.preAuthToken) {
        setPreAuth(result.preAuthToken);
        setMfaSetupRequired(Boolean(result.mfaSetupRequired));
        setCode("");
        return;
      }
      saveSession(result);
      setSession(result);
    });
  }
  async function setupMfa() {
    await run(async () => {
      const result = await api<{ secret: string }>("/auth/mfa/setup", {
        method: "POST",
        headers: { Authorization: `Bearer ${preAuth}` },
      });
      setMfaSecret(result.secret);
      setMessage(
        "Add this secret to your authenticator, then enter its six-digit code.",
      );
    });
  }
  async function verifyMfa(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<Session>("/auth/mfa/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${preAuth}` },
        body: JSON.stringify({ code, deviceName: "Lex web workspace" }),
      });
      saveSession(result);
      setSession(result);
      setPreAuth("");
    });
  }
  async function openMatter(item: Matter) {
    if (!session) return;
    await run(async () =>
      setSelected(
        await api<MatterDetail>(`/matters/${item.id}`, {}, session.accessToken),
      ),
    );
  }
  async function reviewLawyer(
    lawyer: Lawyer,
    decision: "verified" | "declined",
  ) {
    if (!session) return;
    await run(async () => {
      await api(
        `/admin/lawyers/${lawyer.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            evidenceReference: `synthetic-review:${lawyer.supreme_court_number}`,
            expiresAt:
              decision === "verified"
                ? new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString()
                : undefined,
          }),
        },
        session.accessToken,
      );
      await loadWorkspace();
    });
  }
  async function setAvailability(available: boolean, urgentAvailable: boolean) {
    if (!session) return;
    await run(async () => {
      await api(
        "/lawyer/availability",
        { method: "PUT", body: JSON.stringify({ available, urgentAvailable }) },
        session.accessToken,
      );
      setMessage("Availability updated.");
    });
  }
  async function conflict(decision: "accepted" | "declined") {
    if (!session || !selected) return;
    await run(async () => {
      await api(
        `/lawyer/matters/${selected.id}/conflict`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            reasonCode: decision === "accepted" ? "clear" : "existing_client",
            matterVersion: selected.version,
          }),
        },
        session.accessToken,
      );
      setSelected(null);
      await loadWorkspace();
    });
  }
  async function deliverAssessment() {
    if (!session || !selected) return;
    await run(async () => {
      await api(
        `/lawyer/matters/${selected.id}/assessment`,
        {
          method: "POST",
          body: JSON.stringify({
            title: assessment.title,
            body: assessment.body,
            limitations: assessment.limitations,
            nextSteps: assessment.nextSteps
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
            lawyerAttestation: true,
            matterVersion: selected.version,
          }),
        },
        session.accessToken,
      );
      setSelected(null);
      setAssessment({ title: "", body: "", limitations: "", nextSteps: "" });
      await loadWorkspace();
    });
  }
  function signOut() {
    clearSession();
    setSession(null);
    setMatters([]);
  }

  if (!session)
    return (
      <main className="auth-shell">
        <section className="brand-panel">
          <div className="logo">L</div>
          <p className="eyebrow">Nigeria first · globally portable</p>
          <h1>
            Legal access,
            <br />
            <em>carefully managed.</em>
          </h1>
          <p className="lede">
            A protected workspace for verified lawyers and Lex operations.
            Automated drafts are never lawyer-reviewed until a lawyer attests
            them.
          </p>
          <div className="trust">
            <span>MFA protected</span>
            <span>Private evidence</span>
            <span>Audit trail</span>
          </div>
        </section>
        <section className="login-panel">
          <div className="login-card">
            <p className="eyebrow">Controlled pilot workspace</p>
            <h2>
              {preAuth
                ? "Authenticator verification"
                : challengeId
                  ? "Check WhatsApp"
                  : "Welcome back"}
            </h2>
            <p className="muted">
              Lawyer and operations accounts require WhatsApp verification
              followed by MFA.
            </p>
            {!challengeId && !preAuth ? (
              <form onSubmit={requestOtp}>
                <label>
                  WhatsApp phone number
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+234..."
                    required
                  />
                </label>
                <button disabled={busy}>Send secure code</button>
              </form>
            ) : null}
            {challengeId && !preAuth ? (
              <form onSubmit={verifyOtp}>
                <label>
                  Six-digit code
                  <input
                    inputMode="numeric"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    pattern="\d{6}"
                    required
                  />
                </label>
                <button disabled={busy}>Verify identity</button>
              </form>
            ) : null}
            {preAuth ? (
              <form onSubmit={verifyMfa}>
                {mfaSetupRequired && !mfaSecret ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={setupMfa}
                  >
                    Set up authenticator
                  </button>
                ) : null}
                {mfaSecret ? (
                  <div className="secret">
                    <small>Authenticator secret</small>
                    <code>{mfaSecret}</code>
                  </div>
                ) : null}
                <label>
                  Authenticator code
                  <input
                    inputMode="numeric"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    pattern="\d{6}"
                    required
                  />
                </label>
                <button disabled={busy}>Enter workspace</button>
              </form>
            ) : null}
            {message ? <p className="notice">{message}</p> : null}
            <p className="legal">
              Synthetic test data only. No production legal or payment services
              are active.
            </p>
          </div>
        </section>
      </main>
    );

  if (session.user.role === "client")
    return (
      <main className="auth-shell">
        <section className="login-panel">
          <div className="login-card">
            <h2>Workspace access is restricted</h2>
            <p className="muted">
              This responsive workspace is for approved lawyers and Lex
              operations. Use the mobile client for client matters.
            </p>
            <button onClick={signOut}>Sign out</button>
          </div>
        </section>
      </main>
    );
  const admin = ["admin", "super_admin"].includes(session.user.role);
  return (
    <main className="workspace">
      <aside>
        <div className="wordmark">
          <span>L</span> Lex
        </div>
        <nav>
          <a
            className={tab === "matters" ? "active" : ""}
            onClick={() => setTab("matters")}
          >
            Matters <b>{matters.length}</b>
          </a>
          {admin ? (
            <>
              <a
                className={tab === "lawyers" ? "active" : ""}
                onClick={() => setTab("lawyers")}
              >
                Lawyer review{" "}
                <b>
                  {
                    lawyers.filter(
                      (item) => item.verification_status === "pending",
                    ).length
                  }
                </b>
              </a>
              <a
                className={tab === "jobs" ? "active" : ""}
                onClick={() => setTab("jobs")}
              >
                Queue health{" "}
                <b>
                  {jobs.filter((item) => item.state !== "completed").length}
                </b>
              </a>
              <a
                className={tab === "privacy" ? "active" : ""}
                onClick={() => setTab("privacy")}
              >
                Privacy{" "}
                <b>{privacy.filter((item) => item.status === "open").length}</b>
              </a>
              <a
                className={tab === "audits" ? "active" : ""}
                onClick={() => setTab("audits")}
              >
                Audit trail
              </a>
            </>
          ) : null}
        </nav>
        <div className="aside-foot">
          <div className="avatar">{session.user.role[0]?.toUpperCase()}</div>
          <div>
            <strong>{label(session.user.role)}</strong>
            <small>Protected by MFA</small>
          </div>
          <button className="icon" onClick={signOut}>
            ↗
          </button>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Controlled pilot</p>
            <h1>{label(tab)}</h1>
          </div>
          <div>
            {session.user.role === "lawyer" ? (
              <>
                <button
                  className="secondary"
                  onClick={() => setAvailability(true, false)}
                >
                  Available
                </button>
                <button
                  className="secondary"
                  onClick={() => setAvailability(true, true)}
                >
                  Urgent-capable
                </button>
              </>
            ) : null}
            <button className="secondary" onClick={() => loadWorkspace()}>
              Refresh
            </button>
          </div>
        </header>
        {message ? <p className="notice">{message}</p> : null}
        {tab === "matters" ? (
          <Panel title="Role-scoped matters">
            {matters.length === 0 ? (
              <Empty text="No matters are assigned." />
            ) : (
              matters.map((item) => (
                <button
                  className="row"
                  key={item.id}
                  onClick={() => openMatter(item)}
                >
                  <span>
                    <strong>{item.reference}</strong>
                    <small>
                      {item.state_code === "LA" ? "Lagos" : item.state_code} ·{" "}
                      {label(item.urgency)}
                    </small>
                  </span>
                  <span
                    className={`pill ${item.urgency !== "standard" ? "urgent" : ""}`}
                  >
                    {label(item.state)}
                  </span>
                  <span className="arrow">→</span>
                </button>
              ))
            )}
          </Panel>
        ) : null}
        {tab === "lawyers" ? (
          <Panel title="Approval-controlled lawyer applications">
            {lawyers.map((lawyer) => (
              <div className="lawyer" key={lawyer.id}>
                <div className="avatar warm">
                  {lawyer.display_name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </div>
                <div>
                  <strong>{lawyer.display_name}</strong>
                  <small>
                    {lawyer.supreme_court_number} · Called {lawyer.year_of_call}
                  </small>
                </div>
                <span className="pill">
                  {label(lawyer.verification_status)}
                </span>
                {lawyer.verification_status === "pending" ? (
                  <>
                    <button onClick={() => reviewLawyer(lawyer, "verified")}>
                      Verify
                    </button>
                    <button
                      className="secondary"
                      onClick={() => reviewLawyer(lawyer, "declined")}
                    >
                      Decline
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </Panel>
        ) : null}
        {tab === "jobs" ? (
          <Panel title="Queue ledger and recovery">
            {jobs.map((job) => (
              <div className="row" key={job.id}>
                <span>
                  <strong>{label(job.kind)}</strong>
                  <small>
                    {job.queue_name} · Attempt {job.attempts}
                    {job.last_error ? ` · ${job.last_error}` : ""}
                  </small>
                </span>
                <span className="pill">{label(job.state)}</span>
              </div>
            ))}
          </Panel>
        ) : null}
        {tab === "privacy" ? (
          <Panel title="Human-review requests">
            {privacy.map((item) => (
              <div className="row" key={item.id}>
                <span>
                  <strong>{label(item.type)}</strong>
                  <small>
                    Due {new Date(item.due_at).toLocaleDateString()}
                  </small>
                </span>
                <span className="pill">{label(item.status)}</span>
              </div>
            ))}
          </Panel>
        ) : null}
        {tab === "audits" ? (
          <Panel title="Immutable operational events">
            {audits.map((item) => (
              <div className="row" key={item.id}>
                <span>
                  <strong>{label(item.action)}</strong>
                  <small>
                    {item.entity_type} · {item.entity_id}
                  </small>
                </span>
                <small>{new Date(item.occurred_at).toLocaleString()}</small>
              </div>
            ))}
          </Panel>
        ) : null}
      </section>
      {selected ? (
        <div className="drawer">
          <button className="close" onClick={() => setSelected(null)}>
            ×
          </button>
          <p className="eyebrow">Matter detail</p>
          <h2>{selected.reference}</h2>
          <span className="pill">{label(selected.state)}</span>
          <p className="summary">
            {selected.structuredSummary?.summary ??
              "Confirmed intake summary is not available."}
          </p>
          <p className="legal">
            Evidence access and every delivery are audited. AI drafting support
            is not a legal opinion.
          </p>
          {session.user.role === "lawyer" &&
          selected.state === "conflict_review" ? (
            <div>
              <button onClick={() => conflict("accepted")}>
                Conflict clear · accept
              </button>
              <button
                className="secondary"
                onClick={() => conflict("declined")}
              >
                Decline privately
              </button>
            </div>
          ) : null}
          {session.user.role === "lawyer" &&
          ["active", "lawyer_review"].includes(selected.state) ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void deliverAssessment();
              }}
            >
              <label>
                Assessment title
                <input
                  value={assessment.title}
                  onChange={(event) =>
                    setAssessment({ ...assessment, title: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Lawyer-reviewed assessment
                <textarea
                  value={assessment.body}
                  onChange={(event) =>
                    setAssessment({ ...assessment, body: event.target.value })
                  }
                  minLength={100}
                  required
                />
              </label>
              <label>
                Limitations
                <textarea
                  value={assessment.limitations}
                  onChange={(event) =>
                    setAssessment({
                      ...assessment,
                      limitations: event.target.value,
                    })
                  }
                  minLength={20}
                  required
                />
              </label>
              <label>
                Next steps · one per line
                <textarea
                  value={assessment.nextSteps}
                  onChange={(event) =>
                    setAssessment({
                      ...assessment,
                      nextSteps: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <button disabled={busy}>Attest and deliver</button>
            </form>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Live staging view</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="table">{children}</div>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>◇</span>
      <p>{text}</p>
    </div>
  );
}
