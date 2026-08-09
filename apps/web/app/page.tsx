"use client";
import { FormEvent, useEffect, useState } from "react";
import { api, clearSession, readSession, saveSession, type Session } from "@/lib/api";

type Matter = { id: string; reference: string; state: string; urgency: string; dueAt?: string; jurisdiction?: { name: string }; serviceDefinition?: { name: string }; client?: { email?: string; phone?: string }; intakeSession?: { structuredSummary?: { summary?: string } } };
type Lawyer = { id: string; displayName: string; verificationStatus: string; supremeCourtNumber: string; yearOfCall: number; languages: string[]; stateCodes: string[]; user: { email?: string; phone?: string; mfaEnabled: boolean } };

const label = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^\w/u, (letter) => letter.toUpperCase());

export default function Workspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("admin@lex.test");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [preAuth, setPreAuth] = useState("");
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [mfaSecret, setMfaSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [reviews, setReviews] = useState<Array<{ id: string; reason: string; openedAt: string }>>([]);
  const [selected, setSelected] = useState<Matter | null>(null);

  useEffect(() => { setSession(readSession()); }, []);
  useEffect(() => { if (session) void loadWorkspace(session); }, [session]);

  async function loadWorkspace(active: Session) {
    setMessage("");
    try {
      const matterList = await api<Matter[]>("/matters", {}, active.accessToken); setMatters(matterList);
      if (["ADMIN", "SUPER_ADMIN"].includes(active.user.role)) {
        const [lawyerList, reviewList] = await Promise.all([api<Lawyer[]>("/admin/lawyers", {}, active.accessToken), api<typeof reviews>("/admin/human-reviews", {}, active.accessToken)]);
        setLawyers(lawyerList); setReviews(reviewList);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Workspace could not load"); }
  }

  async function requestOtp(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const result = await api<{ challengeId: string; devCode?: string }>("/auth/otp/request", { method: "POST", body: JSON.stringify({ channel: "email", email, purpose: "sign_in" }) }); setChallengeId(result.challengeId); if (result.devCode) setCode(result.devCode); setMessage("Verification code sent. Local test mode may fill it automatically."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not send code"); } finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await api<Session & { mfaSetupRequired?: boolean; mfaRequired?: boolean; preAuthToken?: string }>("/auth/otp/verify", { method: "POST", body: JSON.stringify({ challengeId, code, deviceName: "Lex web workspace" }) });
      if (result.preAuthToken) { setPreAuth(result.preAuthToken); setMfaSetupRequired(Boolean(result.mfaSetupRequired)); setCode(""); setMessage(result.mfaSetupRequired ? "Set up MFA to continue." : "Enter the code from your registered authenticator."); return; }
      saveSession(result); setSession(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verification failed"); } finally { setBusy(false); }
  }

  async function setupMfa() {
    try { const result = await api<{ secret: string }>("/auth/mfa/setup", { method: "POST", headers: { Authorization: `Bearer ${preAuth}` } }); setMfaSecret(result.secret); setMessage("Add this secret to your authenticator, then enter the six-digit code."); } catch (error) { setMessage(error instanceof Error ? error.message : "MFA setup failed"); }
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { const result = await api<Session>("/auth/mfa/verify", { method: "POST", headers: { Authorization: `Bearer ${preAuth}` }, body: JSON.stringify({ code, deviceName: "Lex web workspace" }) }); saveSession(result); setSession(result); setPreAuth(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "MFA verification failed"); } finally { setBusy(false); }
  }

  async function verifyLawyer(lawyer: Lawyer) {
    if (!session) return; setBusy(true);
    try { await api(`/admin/lawyers/${lawyer.id}/review`, { method: "POST", body: JSON.stringify({ decision: "verified", source: "NBA practising list and digital licence", evidenceReference: `internal-test:${lawyer.supremeCourtNumber}`, licenceYear: new Date().getFullYear(), privateNote: "Test verification; public launch requires current evidence review." }) }, session.accessToken); await loadWorkspace(session); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Review failed"); } finally { setBusy(false); }
  }

  function signOut() { clearSession(); setSession(null); setMatters([]); setLawyers([]); }

  if (!session) return <main className="auth-shell"><section className="brand-panel"><div className="logo">L</div><p className="eyebrow">Nigeria first · Globally ready</p><h1>Legal access,<br/><em>carefully managed.</em></h1><p className="lede">One secure workspace for verified lawyers and Lex operations. Every assessment remains human-reviewed.</p><div className="trust"><span>Verified access</span><span>Audit trail</span><span>Private evidence</span></div></section><section className="login-panel"><div className="login-card"><p className="eyebrow">Secure workspace</p><h2>{preAuth ? "Multi-factor verification" : challengeId ? "Check your email" : "Welcome back"}</h2><p className="muted">Lawyers and operations staff must complete MFA before accessing any matter.</p>{!challengeId && !preAuth && <form onSubmit={requestOtp}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required/></label><button disabled={busy}>Send secure code</button></form>}{challengeId && !preAuth && <form onSubmit={verify}><label>Six-digit code<input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} pattern="\d{6}" required/></label><button disabled={busy}>Verify identity</button></form>}{preAuth && <form onSubmit={verifyMfa}>{mfaSetupRequired && !mfaSecret && <button type="button" className="secondary" onClick={setupMfa}>Set up authenticator</button>}{mfaSecret && <div className="secret"><small>Authenticator secret</small><code>{mfaSecret}</code></div>}<label>Authenticator code<input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} pattern="\d{6}" required autoFocus/></label><button disabled={busy}>Enter workspace</button></form>}{message && <p className="notice">{message}</p>}<p className="legal">Private test environment. No production legal or payment services are active.</p></div></section></main>;

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(session.user.role);
  return <main className="workspace"><aside><div className="wordmark"><span>L</span> Lex</div><nav><a className="active">Overview</a><a>Matters <b>{matters.length}</b></a>{isAdmin && <><a>Lawyer review <b>{lawyers.filter((item) => item.verificationStatus === "PENDING").length}</b></a><a>Human review <b>{reviews.length}</b></a><a>Legal content</a><a>Audit log</a></>}<a>Availability</a></nav><div className="aside-foot"><div className="avatar">{session.user.role[0]}</div><div><strong>{label(session.user.role)}</strong><small>Protected by MFA</small></div><button className="icon" onClick={signOut}>↗</button></div></aside><section className="content"><header><div><p className="eyebrow">Operations pulse</p><h1>Good day. Here’s what needs attention.</h1></div><button className="secondary" onClick={() => loadWorkspace(session)}>Refresh</button></header>{message && <p className="notice">{message}</p>}<div className="metrics"><article><small>Open matters</small><strong>{matters.length}</strong><span>Across active workflows</span></article><article><small>Urgent</small><strong>{matters.filter((item) => item.urgency !== "STANDARD").length}</strong><span>Human escalation required</span></article><article><small>Pending lawyers</small><strong>{lawyers.filter((item) => item.verificationStatus === "PENDING").length}</strong><span>Approval-controlled visibility</span></article><article><small>Open reviews</small><strong>{reviews.length}</strong><span>AI and operations exceptions</span></article></div><div className="grid"><section className="panel"><div className="panel-head"><div><p className="eyebrow">Matter queue</p><h2>Current work</h2></div></div><div className="table">{matters.length === 0 ? <Empty text="No matters have entered this workspace yet."/> : matters.map((matter) => <button className="row" key={matter.id} onClick={() => setSelected(matter)}><span><strong>{matter.reference}</strong><small>{matter.serviceDefinition?.name ?? "Tenancy assessment"} · {matter.jurisdiction?.name ?? "Nigeria"}</small></span><span className={`pill ${matter.urgency !== "STANDARD" ? "urgent" : ""}`}>{label(matter.state)}</span><span className="arrow">→</span></button>)}</div></section>{isAdmin && <section className="panel"><div className="panel-head"><div><p className="eyebrow">Marketplace gate</p><h2>Lawyer verification</h2></div></div>{lawyers.slice(0, 5).map((lawyer) => <div className="lawyer" key={lawyer.id}><div className="avatar warm">{lawyer.displayName.split(" ").map((part) => part[0]).join("")}</div><div><strong>{lawyer.displayName}</strong><small>{lawyer.supremeCourtNumber} · Called {lawyer.yearOfCall}</small></div><span className={`pill ${lawyer.verificationStatus === "VERIFIED" ? "good" : ""}`}>{label(lawyer.verificationStatus)}</span>{lawyer.verificationStatus !== "VERIFIED" && <button disabled={busy} onClick={() => verifyLawyer(lawyer)}>Review</button>}</div>)}</section>}</div></section>{selected && <div className="drawer"><button className="close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">Matter detail</p><h2>{selected.reference}</h2><span className="pill">{label(selected.state)}</span><dl><dt>Service</dt><dd>{selected.serviceDefinition?.name ?? "Tenancy assessment"}</dd><dt>Jurisdiction</dt><dd>{selected.jurisdiction?.name ?? "Nigeria"}</dd><dt>Urgency</dt><dd>{label(selected.urgency)}</dd><dt>Due</dt><dd>{selected.dueAt ? new Date(selected.dueAt).toLocaleString() : "Timer not started"}</dd></dl><p className="summary">{selected.intakeSession?.structuredSummary?.summary ?? "Confirmed intake detail is available after the client submits it."}</p><p className="legal">AI output is drafting support only. Delivery requires lawyer attestation.</p></div>}</main>;
}

function Empty({ text }: { text: string }) { return <div className="empty"><span>◇</span><p>{text}</p></div>; }
