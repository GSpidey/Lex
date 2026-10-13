"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  api,
  clearSession,
  REALTIME_URL,
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
  practice_area_code?: string;
  client_type?: string;
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
  consultation?: {
    id: string;
    state: string;
    scheduled_start?: string;
    scheduled_end?: string;
  } | null;
};
type PracticeArea = { code: string; name: string; group: string };
type MatchingRequest = {
  id: string;
  matter_id: string;
  practice_area_code: string;
  state_code: string;
  urgency: string;
  state: string;
  version: number;
  created_at: string;
};
type SafeguardingReview = {
  id: string;
  reason_code: string;
  state: string;
  version: number;
  minor_profile_id?: string;
  matter_id?: string;
  created_at: string;
};
type AuthorityReview = {
  id: string;
  legal_name: string;
  registration_number: string;
  decision: string;
  version: number;
};
type GuardianReview = {
  id: string;
  minor_profile_id: string;
  relationship: string;
  status: string;
  version: number;
};
type ProviderCapability = {
  implemented: boolean;
  configured: boolean;
  status: string;
};
type ProfessionalApplication = {
  id: string;
  user_id: string;
  legal_name: string;
  public_name: string;
  supreme_court_number: string;
  year_of_call: number;
  state: string;
  submitted_at?: string;
  updated_at: string;
};
type LegalDocument = {
  code: string;
  title: string;
  version_id: string;
  version: number;
  status: string;
  content_markdown: string;
  company_placeholder_present: number;
};
type AiRun = {
  id: string;
  purpose: string;
  model: string;
  prompt_version: string;
  schema_version: string;
  confidence_millis?: number;
  requires_human_review: number;
  latency_ms?: number;
  created_at: string;
};
type AuthCountry = {
  iso: string;
  name: string;
  dialCode: string;
  placeholder: string;
};

const AUTH_COUNTRIES: AuthCountry[] = [
  {
    iso: "NG",
    name: "Nigeria",
    dialCode: "+234",
    placeholder: "Enter mobile number",
  },
  {
    iso: "CA",
    name: "Canada",
    dialCode: "+1",
    placeholder: "Enter 10-digit number",
  },
  {
    iso: "GB",
    name: "United Kingdom",
    dialCode: "+44",
    placeholder: "Enter mobile number",
  },
  {
    iso: "US",
    name: "United States",
    dialCode: "+1",
    placeholder: "Enter 10-digit number",
  },
  {
    iso: "GH",
    name: "Ghana",
    dialCode: "+233",
    placeholder: "Enter national number",
  },
  {
    iso: "KE",
    name: "Kenya",
    dialCode: "+254",
    placeholder: "Enter national number",
  },
  {
    iso: "ZA",
    name: "South Africa",
    dialCode: "+27",
    placeholder: "Enter national number",
  },
];

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());

export default function Workspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [authCountryIso, setAuthCountryIso] = useState("NG");
  const [nationalNumber, setNationalNumber] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [preAuth, setPreAuth] = useState("");
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [mfaSecret, setMfaSecret] = useState("");
  const [tab, setTab] = useState<
    | "matters"
    | "lawyers"
    | "matching"
    | "safeguarding"
    | "jobs"
    | "privacy"
    | "audits"
    | "applications"
    | "providers"
    | "legal"
    | "ai"
  >("matters");
  const [matters, setMatters] = useState<Matter[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [privacy, setPrivacy] = useState<Privacy[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [matchingRequests, setMatchingRequests] = useState<MatchingRequest[]>(
    [],
  );
  const [safeguarding, setSafeguarding] = useState<SafeguardingReview[]>([]);
  const [authorityReviews, setAuthorityReviews] = useState<AuthorityReview[]>(
    [],
  );
  const [guardianReviews, setGuardianReviews] = useState<GuardianReview[]>([]);
  const [professionalApplications, setProfessionalApplications] = useState<
    ProfessionalApplication[]
  >([]);
  const [providerCapabilities, setProviderCapabilities] = useState<
    Record<string, ProviderCapability>
  >({});
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
  const [aiRuns, setAiRuns] = useState<AiRun[]>([]);
  const [catalog, setCatalog] = useState<PracticeArea[]>([]);
  const [application, setApplication] = useState({
    legalName: "",
    displayName: "",
    email: "",
    professionalPhone: "",
    supremeCourtNumber: "",
    yearOfCall: String(new Date().getFullYear()),
    firmName: "",
    officeAddress: "",
    website: "",
    bio: "",
    practiceAreaCodes: [] as string[],
    conductDeclaration: false,
  });
  const [selected, setSelected] = useState<MatterDetail | null>(null);
  const [assessment, setAssessment] = useState({
    title: "",
    body: "",
    limitations: "",
    nextSteps: "",
  });
  const [proposal, setProposal] = useState({
    scope: "",
    exclusions: "",
    feeSummary: "",
    expectedExpenses: "",
    cancellationTerms: "",
    clientResponsibilities: "",
    milestoneTitle: "",
    milestoneAmount: "",
  });
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveBody, setLiveBody] = useState("");
  const [liveSocket, setLiveSocket] = useState<WebSocket | null>(null);
  const [busy, setBusy] = useState(false);
  const authCountry =
    AUTH_COUNTRIES.find((country) => country.iso === authCountryIso) ??
    AUTH_COUNTRIES[0]!;
  const normalizedNationalNumber = nationalNumber
    .replace(/\D/gu, "")
    .replace(/^0/u, "");
  const phone = `${authCountry.dialCode}${normalizedNationalNumber}`;
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
      const catalogue = await api<{ groups: Array<{ items: PracticeArea[] }> }>(
        "/catalog/practice-areas",
      );
      setCatalog(catalogue.groups.flatMap((group) => group.items));
      if (["operations", "owner"].includes(active.user.role)) {
        const [
          lawyerRows,
          jobRows,
          privacyRows,
          auditRows,
          matchingRows,
          safeguardingRows,
          authorityRows,
          guardianRows,
        ] = await Promise.all([
          api<Lawyer[]>("/admin/lawyers", {}, active.accessToken),
          api<Job[]>("/admin/jobs", {}, active.accessToken),
          api<Privacy[]>("/admin/privacy", {}, active.accessToken),
          api<Audit[]>("/admin/audits", {}, active.accessToken),
          api<MatchingRequest[]>(
            "/admin/matching-assistance",
            {},
            active.accessToken,
          ),
          api<SafeguardingReview[]>(
            "/admin/safeguarding",
            {},
            active.accessToken,
          ),
          api<AuthorityReview[]>(
            "/admin/authority-reviews",
            {},
            active.accessToken,
          ),
          api<GuardianReview[]>(
            "/admin/guardian-links",
            {},
            active.accessToken,
          ),
        ]);
        setLawyers(lawyerRows);
        setJobs(jobRows);
        setPrivacy(privacyRows);
        setAudits(auditRows);
        setMatchingRequests(matchingRows);
        setSafeguarding(safeguardingRows);
        setAuthorityReviews(authorityRows);
        setGuardianReviews(guardianRows);
        const [applicationRows, providers, legal, ai] = await Promise.all([
          api<ProfessionalApplication[]>(
            "/owner/professional-applications",
            {},
            active.accessToken,
          ),
          api<Record<string, ProviderCapability>>(
            "/owner/providers",
            {},
            active.accessToken,
          ),
          api<{ items: LegalDocument[] }>(
            "/legal/documents?language=en",
            {},
            active.accessToken,
          ),
          api<AiRun[]>("/owner/ai-runs", {}, active.accessToken),
        ]);
        setProfessionalApplications(applicationRows);
        setProviderCapabilities(providers);
        setLegalDocuments(legal.items);
        setAiRuns(ai);
      }
    });
  }
  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<{
        challengeId: string;
        devCode?: string;
        stagingTestLogin?: boolean;
      }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({
          channel: "whatsapp",
          phone,
          purpose: "sign_in",
          locale: "en",
        }),
      });
      setChallengeId(result.challengeId);
      if (result.devCode) setCode(result.devCode);
      setMessage(
        result.stagingTestLogin
          ? "Founder staging login is ready. Enter the private six-digit test code."
          : "A verification code was sent through WhatsApp.",
      );
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
  async function assignMatching(request: MatchingRequest, lawyerId: string) {
    if (!session || !lawyerId) return;
    await run(async () => {
      await api(
        `/admin/matching-assistance/${request.id}/assign`,
        {
          method: "POST",
          body: JSON.stringify({ lawyerId, version: request.version }),
        },
        session.accessToken,
      );
      await loadWorkspace();
    });
  }
  async function resolveSafeguarding(
    review: SafeguardingReview,
    resolution: "restricted_continue" | "guardian_required" | "closed",
  ) {
    if (!session) return;
    await run(async () => {
      await api(
        `/admin/safeguarding/${review.id}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({ resolution, version: review.version }),
        },
        session.accessToken,
      );
      await loadWorkspace();
    });
  }
  async function decideAuthority(
    review: AuthorityReview,
    decision: "approved" | "declined",
  ) {
    if (!session) return;
    await run(async () => {
      await api(
        `/admin/authority-reviews/${review.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            version: review.version,
            reason: "Recorded operations review",
          }),
        },
        session.accessToken,
      );
      await loadWorkspace();
    });
  }
  async function decideGuardian(
    review: GuardianReview,
    decision: "verified" | "declined" | "safeguarding_review",
  ) {
    if (!session) return;
    await run(async () => {
      await api(
        `/admin/guardian-links/${review.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            version: review.version,
            reason: "Recorded operations review",
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
  async function submitLawyerApplication(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    await run(async () => {
      await api(
        "/professional-applications/me",
        {
          method: "PUT",
          body: JSON.stringify({
            legalName: application.legalName,
            publicName: application.displayName,
            professionalEmail: application.email,
            professionalPhone: application.professionalPhone || phone,
            supremeCourtNumber: application.supremeCourtNumber,
            yearOfCall: Number(application.yearOfCall),
            jurisdictionOfCall: "Nigeria",
            firmName: application.firmName || undefined,
            officeAddress: application.officeAddress || undefined,
            website: application.website || undefined,
            biography: application.bio,
            languages: ["en"],
            stateCodes: [
              "AB",
              "AD",
              "AK",
              "AN",
              "BA",
              "BY",
              "BE",
              "BO",
              "CR",
              "DE",
              "EB",
              "ED",
              "EK",
              "EN",
              "FC",
              "GO",
              "IM",
              "JI",
              "KD",
              "KN",
              "KT",
              "KE",
              "KO",
              "KW",
              "LA",
              "NA",
              "NI",
              "OG",
              "ON",
              "OS",
              "OY",
              "PL",
              "RI",
              "SO",
              "TA",
              "YO",
              "ZA",
            ],
            practiceAreaCodes: application.practiceAreaCodes,
            consultationModes: ["live_text", "voice_note", "secure_message"],
            weeklyCapacity: 5,
            urgentAvailable: false,
            conductDeclaration: application.conductDeclaration,
            termsVersion: "lawyer-participation-en-v1-staging-draft",
          }),
        },
        session.accessToken,
      );
      await api(
        "/professional-applications/me/submit",
        { method: "POST" },
        session.accessToken,
      );
      setMessage(
        "Application submitted. Sign out and sign in again to set up mandatory MFA and see verification status.",
      );
    });
  }

  async function reviewProfessionalApplication(
    item: ProfessionalApplication,
    decision: "information_requested" | "approved" | "declined",
  ) {
    if (!session) return;
    await run(async () => {
      await api(
        `/owner/professional-applications/${item.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            reason:
              decision === "approved"
                ? "Identity, practising list and current digital licence evidence reviewed in controlled staging."
                : decision === "information_requested"
                  ? "Additional practising-list, licence, capability or payout evidence is required."
                  : "Professional verification requirements were not satisfied.",
            evidenceReference: `restricted-professional-review:${item.id}`,
            licenceExpiresAt:
              decision === "approved"
                ? new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString()
                : undefined,
          }),
        },
        session.accessToken,
      );
      await loadWorkspace();
    });
  }

  async function switchRole(
    role: "client" | "lawyer" | "operations" | "owner",
  ) {
    if (!session || role === session.user.role) return;
    await run(async () => {
      const next = await api<Session>(
        "/auth/active-role",
        { method: "POST", body: JSON.stringify({ role }) },
        session.accessToken,
      );
      saveSession(next);
      setTab("matters");
      setSelected(null);
      setSession(next);
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
  async function scheduleConsultation() {
    if (!session || !selected) return;
    await run(async () => {
      await api(
        "/consultations",
        {
          method: "POST",
          body: JSON.stringify({
            matterId: selected.id,
            startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            durationMinutes: 60,
            mode: "live_text",
            timeZone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              "Africa/Lagos",
            idempotencyKey: `web:${selected.id}:initial`,
          }),
        },
        session.accessToken,
      );
      await openMatter(selected);
    });
  }
  async function joinConsultation() {
    if (!session || !selected?.consultation) return;
    await run(async () => {
      const token = await api<{ token: string }>(
        `/consultations/${selected.consultation!.id}/realtime-token`,
        { method: "POST" },
        session.accessToken,
      );
      liveSocket?.close();
      const socket = new WebSocket(
        `${REALTIME_URL.replace(/^http/u, "ws")}/consultations/${selected.consultation!.id}`,
        ["lex.realtime.v1", `bearer.${token.token}`],
      );
      socket.onopen = () => {
        setLiveConnected(true);
        setMessage("Live consultation connected.");
      };
      socket.onclose = () => setLiveConnected(false);
      socket.onerror = () =>
        setMessage(
          "Live consultation could not connect; secure matter messaging remains available.",
        );
      socket.onmessage = () => void openMatter(selected);
      setLiveSocket(socket);
    });
  }
  function sendLiveMessage() {
    if (
      !liveSocket ||
      liveSocket.readyState !== WebSocket.OPEN ||
      !liveBody.trim()
    )
      return;
    liveSocket.send(
      JSON.stringify({
        type: "message",
        clientMessageId: crypto.randomUUID(),
        body: liveBody.trim(),
      }),
    );
    setLiveBody("");
  }
  async function offerRepresentation(event: FormEvent) {
    event.preventDefault();
    if (!session || !selected) return;
    await run(async () => {
      await api(
        `/engagements/${selected.id}/proposals`,
        {
          method: "POST",
          body: JSON.stringify({
            scope: proposal.scope,
            exclusions: proposal.exclusions,
            feeBasis: "milestone",
            feeSummary: proposal.feeSummary,
            expectedExpenses: proposal.expectedExpenses,
            cancellationTerms: proposal.cancellationTerms,
            clientResponsibilities: proposal.clientResponsibilities,
            milestones: proposal.milestoneTitle
              ? [
                  {
                    title: proposal.milestoneTitle,
                    amountMinor: proposal.milestoneAmount
                      ? Math.round(Number(proposal.milestoneAmount) * 100)
                      : undefined,
                  },
                ]
              : [],
            lawyerAttestation: true,
          }),
        },
        session.accessToken,
      );
      setMessage(
        "Representation proposal offered for the client to review separately.",
      );
      setSelected(null);
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
          <img
            className="logo"
            src="/lex-icon.png"
            alt="Lex"
            width={48}
            height={48}
          />
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
            <p className="eyebrow">Nationwide synthetic workspace</p>
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
                  <div className="phone-field">
                    <select
                      aria-label="Phone country"
                      value={authCountryIso}
                      onChange={(event) =>
                        setAuthCountryIso(event.target.value)
                      }
                    >
                      {AUTH_COUNTRIES.map((country) => (
                        <option key={country.iso} value={country.iso}>
                          {country.name} ({country.dialCode})
                        </option>
                      ))}
                    </select>
                    <div className="national-number">
                      <span>{authCountry.dialCode}</span>
                      <input
                        value={nationalNumber}
                        onChange={(event) =>
                          setNationalNumber(event.target.value)
                        }
                        inputMode="tel"
                        autoComplete="tel-national"
                        placeholder={authCountry.placeholder}
                        aria-label="National phone number"
                        required
                      />
                    </div>
                    <small className="field-help">
                      Enter the national number without the country code. A
                      leading 0 is accepted.
                    </small>
                  </div>
                </label>
                <button disabled={busy || normalizedNationalNumber.length < 7}>
                  Send secure code
                </button>
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
        <section className="brand-panel">
          <img
            className="logo"
            src="/lex-icon.png"
            alt="Lex"
            width={48}
            height={48}
          />
          <p className="eyebrow">Join the verified Lex network</p>
          <h1>
            Apply as a<br />
            <em>Nigerian lawyer.</em>
          </h1>
          <p className="lede">
            Applications are open. Marketplace access remains hidden until
            operations records current practising-list and licence verification.
          </p>
        </section>
        <section className="login-panel scroll-panel">
          <div className="login-card">
            <h2>Lawyer application</h2>
            {(session.user.roles?.length ?? 0) > 1 ? (
              <div className="role-switcher" aria-label="Assigned workspaces">
                {session.user.roles?.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={role === session.user.role ? "" : "secondary"}
                    onClick={() => void switchRole(role)}
                  >
                    {label(role)} workspace
                  </button>
                ))}
              </div>
            ) : null}
            <form onSubmit={submitLawyerApplication}>
              <label>
                Legal name
                <input
                  value={application.legalName}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      legalName: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                Display name
                <input
                  value={application.displayName}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      displayName: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                Professional email
                <input
                  type="email"
                  value={application.email}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      email: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                Professional phone
                <input
                  value={application.professionalPhone}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      professionalPhone: event.target.value,
                    })
                  }
                  placeholder="+234..."
                  required
                />
              </label>
              <label>
                Supreme Court / NBA identifier
                <input
                  value={application.supremeCourtNumber}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      supremeCourtNumber: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                Year of call
                <input
                  type="number"
                  min="1900"
                  value={application.yearOfCall}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      yearOfCall: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                Firm name
                <input
                  value={application.firmName}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      firmName: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Office address
                <input
                  value={application.officeAddress}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      officeAddress: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Firm website
                <input
                  type="url"
                  value={application.website}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      website: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Professional biography
                <textarea
                  minLength={30}
                  value={application.bio}
                  onChange={(event) =>
                    setApplication({ ...application, bio: event.target.value })
                  }
                  required
                />
              </label>
              <label>Practice capabilities</label>
              <div className="capability-grid">
                {catalog.map((area) => {
                  const selected = application.practiceAreaCodes.includes(
                    area.code,
                  );
                  return (
                    <button
                      key={area.code}
                      type="button"
                      className={selected ? "selected-capability" : "secondary"}
                      onClick={() =>
                        setApplication({
                          ...application,
                          practiceAreaCodes: selected
                            ? application.practiceAreaCodes.filter(
                                (code) => code !== area.code,
                              )
                            : [...application.practiceAreaCodes, area.code],
                        })
                      }
                    >
                      {area.name}
                    </button>
                  );
                })}
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={application.conductDeclaration}
                  onChange={(event) =>
                    setApplication({
                      ...application,
                      conductDeclaration: event.target.checked,
                    })
                  }
                  required
                />
                I declare that the professional, disciplinary and conflict
                information supplied is complete and accurate.
              </label>
              <button
                disabled={
                  busy ||
                  application.practiceAreaCodes.length === 0 ||
                  !application.conductDeclaration
                }
              >
                Submit for verification
              </button>
            </form>
            {message ? <p className="notice">{message}</p> : null}
            <p className="legal">
              MFA becomes mandatory after submission. Verification and annual
              expiry remain operations-controlled.
            </p>
            <button onClick={signOut}>Sign out</button>
          </div>
        </section>
      </main>
    );
  const admin = ["operations", "owner"].includes(session.user.role);
  return (
    <main className="workspace">
      <aside>
        <div className="wordmark">
          <img
            className="logo"
            src="/lex-icon.png"
            alt=""
            width={48}
            height={48}
          />{" "}
          Lex
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
                className={tab === "applications" ? "active" : ""}
                onClick={() => setTab("applications")}
              >
                Professional applications
                <b>
                  {
                    professionalApplications.filter((item) =>
                      [
                        "submitted",
                        "under_review",
                        "information_requested",
                      ].includes(item.state),
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
                className={tab === "matching" ? "active" : ""}
                onClick={() => setTab("matching")}
              >
                Matching assistance{" "}
                <b>
                  {
                    matchingRequests.filter((item) => item.state === "open")
                      .length
                  }
                </b>
              </a>
              <a
                className={tab === "safeguarding" ? "active" : ""}
                onClick={() => setTab("safeguarding")}
              >
                Safeguarding{" "}
                <b>
                  {safeguarding.filter((item) => item.state === "open").length}
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
              <a
                className={tab === "providers" ? "active" : ""}
                onClick={() => setTab("providers")}
              >
                Provider readiness
              </a>
              <a
                className={tab === "ai" ? "active" : ""}
                onClick={() => setTab("ai")}
              >
                AI runs
                <b>
                  {
                    aiRuns.filter((item) => item.requires_human_review === 1)
                      .length
                  }
                </b>
              </a>
              <a
                className={tab === "legal" ? "active" : ""}
                onClick={() => setTab("legal")}
              >
                Legal centre
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
        {(session.user.roles?.length ?? 0) > 1 ? (
          <div className="aside-roles" aria-label="Assigned workspaces">
            {session.user.roles?.map((role) => (
              <button
                key={role}
                className={role === session.user.role ? "" : "secondary"}
                onClick={() => void switchRole(role)}
              >
                {label(role)}
              </button>
            ))}
          </div>
        ) : null}
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Nationwide legal-access operations</p>
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
                      {item.state_code} ·{" "}
                      {label(item.practice_area_code ?? "legal matter")} ·{" "}
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
        {tab === "applications" ? (
          <Panel title="Legal professional verification">
            {professionalApplications.length === 0 ? (
              <Empty text="No professional applications." />
            ) : (
              professionalApplications.map((item) => (
                <div className="lawyer" key={item.id}>
                  <div className="avatar warm">
                    {item.public_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong>{item.legal_name}</strong>
                    <small>
                      {item.supreme_court_number} · Called {item.year_of_call} ·
                      Role access remains separate from marketplace eligibility
                    </small>
                  </div>
                  <span className="pill">{label(item.state)}</span>
                  {[
                    "submitted",
                    "under_review",
                    "information_requested",
                  ].includes(item.state) ? (
                    <>
                      <button
                        onClick={() =>
                          reviewProfessionalApplication(item, "approved")
                        }
                      >
                        Approve
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          reviewProfessionalApplication(
                            item,
                            "information_requested",
                          )
                        }
                      >
                        Request information
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          reviewProfessionalApplication(item, "declined")
                        }
                      >
                        Decline
                      </button>
                    </>
                  ) : null}
                </div>
              ))
            )}
            <p className="legal">
              Approval records identity, practising-list and digital-licence
              review. Marketplace availability remains off until capabilities,
              expiry and payout configuration are complete.
            </p>
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
        {tab === "matching" ? (
          <Panel title="Operations-assisted lawyer matching">
            {matchingRequests.length === 0 ? (
              <Empty text="No matching assistance requests." />
            ) : (
              matchingRequests.map((item) => (
                <div className="row" key={item.id}>
                  <span>
                    <strong>{label(item.practice_area_code)}</strong>
                    <small>
                      {item.state_code} · {label(item.urgency)} ·{" "}
                      {item.matter_id}
                    </small>
                  </span>
                  <span className="pill">{label(item.state)}</span>
                </div>
              ))
            )}
            {matchingRequests
              .filter((item) => item.state === "open")
              .map((item) => (
                <div className="row" key={`assign-${item.id}`}>
                  <span>
                    <strong>Assign an eligible verified lawyer</strong>
                    <small>
                      Operations records the assignment; conflict review still
                      occurs before payment.
                    </small>
                  </span>
                  <select
                    aria-label="Assign eligible lawyer"
                    defaultValue=""
                    onChange={(event) =>
                      void assignMatching(item, event.target.value)
                    }
                  >
                    <option value="" disabled>
                      Select lawyer
                    </option>
                    {lawyers
                      .filter(
                        (lawyer) =>
                          lawyer.verification_status === "verified" &&
                          lawyer.available === 1,
                      )
                      .map((lawyer) => (
                        <option key={lawyer.id} value={lawyer.id}>
                          {lawyer.display_name}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
          </Panel>
        ) : null}
        {tab === "safeguarding" ? (
          <Panel title="Restricted safeguarding review">
            {safeguarding.length === 0 ? (
              <Empty text="No safeguarding reviews." />
            ) : (
              safeguarding.map((item) => (
                <div className="row" key={item.id}>
                  <span>
                    <strong>{label(item.reason_code)}</strong>
                    <small>
                      {item.matter_id ??
                        item.minor_profile_id ??
                        "restricted subject"}
                    </small>
                  </span>
                  <span className="pill urgent">{label(item.state)}</span>
                </div>
              ))
            )}
            {safeguarding
              .filter((item) => item.state === "open")
              .map((item) => (
                <div className="row" key={`resolve-${item.id}`}>
                  <span>
                    <strong>Restricted human decision</strong>
                    <small>
                      Record a least-disclosure safeguarding outcome.
                    </small>
                  </span>
                  <button
                    onClick={() =>
                      resolveSafeguarding(item, "restricted_continue")
                    }
                  >
                    Restricted continue
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      resolveSafeguarding(item, "guardian_required")
                    }
                  >
                    Require guardian
                  </button>
                  <button
                    className="secondary"
                    onClick={() => resolveSafeguarding(item, "closed")}
                  >
                    Close
                  </button>
                </div>
              ))}
            <h3>Organization authority reviews</h3>
            {authorityReviews
              .filter((item) => item.decision === "pending")
              .map((item) => (
                <div className="row" key={item.id}>
                  <span>
                    <strong>{item.legal_name}</strong>
                    <small>{item.registration_number}</small>
                  </span>
                  <button onClick={() => decideAuthority(item, "approved")}>
                    Approve authority
                  </button>
                  <button
                    className="secondary"
                    onClick={() => decideAuthority(item, "declined")}
                  >
                    Decline
                  </button>
                </div>
              ))}
            <h3>Guardian-link reviews</h3>
            {guardianReviews
              .filter((item) => item.status === "pending")
              .map((item) => (
                <div className="row" key={item.id}>
                  <span>
                    <strong>{label(item.relationship)}</strong>
                    <small>{item.minor_profile_id}</small>
                  </span>
                  <button onClick={() => decideGuardian(item, "verified")}>
                    Verify guardian
                  </button>
                  <button
                    className="secondary"
                    onClick={() => decideGuardian(item, "safeguarding_review")}
                  >
                    Safeguarding
                  </button>
                  <button
                    className="secondary"
                    onClick={() => decideGuardian(item, "declined")}
                  >
                    Decline
                  </button>
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
        {tab === "providers" ? (
          <Panel title="Provider capability and verification">
            {Object.entries(providerCapabilities).map(
              ([provider, capability]) => (
                <div className="row" key={provider}>
                  <span>
                    <strong>{label(provider)}</strong>
                    <small>
                      {capability.implemented
                        ? "Implementation present"
                        : "Not implemented"}{" "}
                      · Provider evidence is separate from local mocks
                    </small>
                  </span>
                  <span
                    className={`pill ${capability.configured ? "good" : "urgent"}`}
                  >
                    {label(capability.status)}
                  </span>
                </div>
              ),
            )}
          </Panel>
        ) : null}
        {tab === "ai" ? (
          <Panel title="Redacted AI run diagnostics">
            {aiRuns.length === 0 ? (
              <Empty text="No AI runs have been recorded." />
            ) : (
              aiRuns.map((run) => (
                <div className="row" key={run.id}>
                  <span>
                    <strong>{label(run.purpose)}</strong>
                    <small>
                      {run.model} · {run.prompt_version} · {run.schema_version}{" "}
                      · {run.latency_ms ?? 0} ms
                    </small>
                  </span>
                  <span
                    className={`pill ${run.requires_human_review ? "urgent" : "good"}`}
                  >
                    {run.requires_human_review ? "Human review" : "Recorded"}
                  </span>
                </div>
              ))
            )}
            <p className="legal">
              Raw prompts, secrets and unrestricted matter content are not
              displayed here.
            </p>
          </Panel>
        ) : null}
        {tab === "legal" ? (
          <Panel title="Versioned Legal Centre">
            <p>
              <a href="/legal/">Read effective public policies</a>
              {session.user.role === "owner" ? (
                <>
                  {" "}
                  · <a href="/legal/review/">Review drafts and approvals</a>
                </>
              ) : null}
            </p>
            {!legalDocuments.length ? (
              <p>
                No policies have been published. Authorized owners can review
                the drafts privately.
              </p>
            ) : null}
            {legalDocuments.map((document) => (
              <details className="legal-document" key={document.version_id}>
                <summary>
                  <strong>{document.title}</strong>
                  <span className="pill">
                    v{document.version} · {label(document.status)}
                  </span>
                </summary>
                {document.company_placeholder_present ? (
                  <p className="notice">
                    Production publication is blocked while parent-company
                    details or approvals are unresolved.
                  </p>
                ) : null}
                <pre>{document.content_markdown}</pre>
              </details>
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
          ["consultation_active", "awaiting_client", "lawyer_review"].includes(
            selected.state,
          ) ? (
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
          {session.user.role === "lawyer" &&
          selected.state === "consultation_scheduled" ? (
            <div>
              {!selected.consultation ? (
                <button onClick={scheduleConsultation}>
                  Schedule one-hour live text consultation
                </button>
              ) : (
                <button onClick={joinConsultation}>
                  {liveConnected
                    ? "Consultation connected"
                    : "Join live consultation"}
                </button>
              )}
              {liveConnected ? (
                <div>
                  <textarea
                    value={liveBody}
                    onChange={(event) => setLiveBody(event.target.value)}
                    placeholder="Private live consultation message"
                  />
                  <button onClick={sendLiveMessage}>Send live message</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {session.user.role === "lawyer" && selected.state === "delivered" ? (
            <form onSubmit={offerRepresentation}>
              <h3>Optional representation proposal</h3>
              <p className="legal">
                This is a separate engagement. Lex does not calculate court
                deadlines, hold client money, appear in court, or guarantee an
                outcome.
              </p>
              <label>
                Scope
                <textarea
                  minLength={20}
                  required
                  value={proposal.scope}
                  onChange={(event) =>
                    setProposal({ ...proposal, scope: event.target.value })
                  }
                />
              </label>
              <label>
                Exclusions
                <textarea
                  minLength={5}
                  required
                  value={proposal.exclusions}
                  onChange={(event) =>
                    setProposal({ ...proposal, exclusions: event.target.value })
                  }
                />
              </label>
              <label>
                Fee summary
                <textarea
                  minLength={5}
                  required
                  value={proposal.feeSummary}
                  onChange={(event) =>
                    setProposal({ ...proposal, feeSummary: event.target.value })
                  }
                />
              </label>
              <label>
                Expected expenses
                <textarea
                  value={proposal.expectedExpenses}
                  onChange={(event) =>
                    setProposal({
                      ...proposal,
                      expectedExpenses: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Cancellation terms
                <textarea
                  minLength={10}
                  required
                  value={proposal.cancellationTerms}
                  onChange={(event) =>
                    setProposal({
                      ...proposal,
                      cancellationTerms: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Client responsibilities
                <textarea
                  minLength={10}
                  required
                  value={proposal.clientResponsibilities}
                  onChange={(event) =>
                    setProposal({
                      ...proposal,
                      clientResponsibilities: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                First milestone
                <input
                  value={proposal.milestoneTitle}
                  onChange={(event) =>
                    setProposal({
                      ...proposal,
                      milestoneTitle: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Milestone amount (NGN)
                <input
                  inputMode="decimal"
                  value={proposal.milestoneAmount}
                  onChange={(event) =>
                    setProposal({
                      ...proposal,
                      milestoneAmount: event.target.value,
                    })
                  }
                />
              </label>
              <button disabled={busy}>Attest and offer proposal</button>
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
