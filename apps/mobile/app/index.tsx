import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { NIGERIA_STATES, PRACTICE_AREAS } from "@lex/jurisdictions";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  APP_ENV,
  API_URL,
  REALTIME_URL,
  api,
  clearSession,
  loadSession,
  saveSession,
  type Session,
} from "@/lib/api";

type Language = "en" | "pcm" | "ha" | "yo" | "ig";
type Role = "tenant" | "landlord";
type ClientType = "adult_individual" | "minor" | "organization";
type Question = {
  key: string;
  label: string;
  type: "text" | "long_text" | "date" | "money" | "boolean" | "multi_select";
  required: boolean;
  options?: readonly string[];
};
type Workflow = {
  code: string;
  version: number;
  title: string;
  disclosure: string;
  questions: Question[];
  evidence: string[];
  practiceAreaCode?: string;
};
type Summary = {
  summary: string;
  facts: string[];
  missingInformation: string[];
  urgency: string;
  safeClientConfirmation: string;
  intakeVersion: number;
};
type Intake = {
  id: string;
  state: string;
  jurisdictionStatus: string;
  workflow: Workflow;
  service?: Workflow;
  version: number;
};
type Matter = {
  id: string;
  reference: string;
  state: string;
  urgency: string;
  state_code: string;
  practice_area_code?: string;
  client_type?: ClientType;
  version: number;
  due_at?: string | null;
};
type MatterDetail = Matter & {
  messages: Array<{
    id: string;
    body: string;
    created_at: string;
    sender_user_id?: string;
  }>;
  evidence: Array<{ id: string; file_name: string; status: string }>;
  assessment?: {
    title: string;
    body: string;
    limitations: string;
    next_steps_json: string;
  } | null;
  structuredSummary?: Summary;
  consultation?: {
    id: string;
    state: string;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    time_zone?: string | null;
  } | null;
};
type Transcription = {
  id: string;
  status: string;
  transcript?: string;
  confirmed_transcript?: string;
  version: number;
};
type RepresentationEngagement = {
  id: string;
  matter_id: string;
  state: string;
  proposals: Array<{
    id: string;
    version: number;
    scope: string;
    exclusions: string;
    fee_summary: string;
    expected_expenses: string;
    cancellation_terms: string;
    client_responsibilities: string;
    state: string;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    state: string;
    amount_minor?: number | null;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    description: string;
    amount_minor: number;
    state: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    state: string;
    due_at?: string | null;
  }>;
  deadlines: Array<{
    id: string;
    title: string;
    due_at: string;
    source: string;
  }>;
  disputes: Array<{ id: string; reason_code: string; state: string }>;
};
type Preferences = { whatsapp: boolean; push: boolean; email: boolean };
type CountryCode = {
  country: string;
  iso: string;
  dialCode: string;
};
type AiConversation = {
  id: string;
  state: string;
  provider?: string;
  classification_json?: string | null;
  turns?: Array<{
    id: string;
    actor: "client" | "assistant" | "operations";
    body: string;
    status: string;
    created_at: string;
  }>;
};
type LegalDocument = {
  id: string;
  code: string;
  title: string;
  version_id: string;
  version: number;
  status: string;
  content_markdown: string;
  company_placeholder_present: number;
};

const COUNTRY_CODES: CountryCode[] = [
  { country: "Nigeria", iso: "NG", dialCode: "+234" },
  { country: "Ghana", iso: "GH", dialCode: "+233" },
  { country: "Kenya", iso: "KE", dialCode: "+254" },
  { country: "South Africa", iso: "ZA", dialCode: "+27" },
  { country: "Uganda", iso: "UG", dialCode: "+256" },
  { country: "Rwanda", iso: "RW", dialCode: "+250" },
  { country: "United Kingdom", iso: "GB", dialCode: "+44" },
  { country: "United States / Canada", iso: "US", dialCode: "+1" },
  { country: "United Arab Emirates", iso: "AE", dialCode: "+971" },
  { country: "India", iso: "IN", dialCode: "+91" },
];
const STAGING_TEST_PHONE = "+2348000000001";

const copy = {
  en: {
    welcome: "Welcome",
    headline: "Your legal issue, clearly understood.",
    start: "Get legal help",
    tenant: "Tenant",
    landlord: "Landlord",
    continue: "Continue with WhatsApp",
    code: "Verification code",
    verify: "Verify and continue",
    confirm: "I confirm these facts",
    submit: "Submit for matching",
  },
  pcm: {
    welcome: "You are welcome",
    headline: "Make we understand your legal matter well.",
    start: "Find legal help",
    tenant: "Tenant",
    landlord: "Landlord",
    continue: "Continue with WhatsApp",
    code: "Verification code",
    verify: "Verify and continue",
    confirm: "I confirm say this correct",
    submit: "Send am for lawyer matching",
  },
  ha: {
    welcome: "Barka da zuwa",
    headline: "Bari mu fahimci matsalarka ta doka sosai.",
    start: "Nemi taimakon doka",
    tenant: "Dan haya",
    landlord: "Mai gida",
    continue: "Ci gaba da WhatsApp",
    code: "Lambar tantancewa",
    verify: "Tabbatar ka ci gaba",
    confirm: "Na tabbatar bayanan nan daidai ne",
    submit: "Tura domin a hada da lauya",
  },
  yo: {
    welcome: "Káàbọ̀",
    headline: "Jẹ́ ká lóye ọ̀ràn òfin rẹ dáadáa.",
    start: "Wá ìrànlọ́wọ́ òfin",
    tenant: "Ayálégbé",
    landlord: "Onílé",
    continue: "Tẹ̀síwájú pẹ̀lú WhatsApp",
    code: "Kóòdù ìmúdájú",
    verify: "Jẹ́rìí kí o tẹ̀síwájú",
    confirm: "Mo jẹ́rìí pé òtítọ́ ni",
    submit: "Firanṣẹ́ fún ìbámu agbẹjọ́rò",
  },
  ig: {
    welcome: "Nnọọ",
    headline: "Ka anyị ghọta okwu iwu gị nke ọma.",
    start: "Chọọ enyemaka iwu",
    tenant: "Onye bi n'ụlọ mgbazinye",
    landlord: "Onye nwe ụlọ",
    continue: "Gaa n'ihu na WhatsApp",
    code: "Koodu nkwenye",
    verify: "Kwenye ma gaa n'ihu",
    confirm: "Ekwenyere m na eziokwu ndị a ziri ezi",
    submit: "Zipụ maka ijikọ ọka iwu",
  },
};
const stateChoices = NIGERIA_STATES.map(([code, name]) => ({ code, name }));
const title = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());

export default function LexApp() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [screen, setScreen] = useState<
    "home" | "intake" | "matter" | "settings" | "privacy" | "ask" | "legal"
  >("home");
  const [language, setLanguage] = useState<Language>("en");
  const [role, setRole] = useState<Role>("tenant");
  const [clientType, setClientType] = useState<ClientType>("adult_individual");
  const [clientSubjectId, setClientSubjectId] = useState<string>();
  const [subjectName, setSubjectName] = useState("");
  const [subjectDetail, setSubjectDetail] = useState("");
  const [practiceAreaCode, setPracticeAreaCode] = useState("not-sure");
  const [stateCode, setStateCode] = useState("LA");
  const [country, setCountry] = useState(COUNTRY_CODES[0]!);
  const [nationalNumber, setNationalNumber] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [intake, setIntake] = useState<Intake | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [matter, setMatter] = useState<MatterDetail | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const liveSocket = useRef<WebSocket | null>(null);
  const [engagement, setEngagement] = useState<RepresentationEngagement | null>(
    null,
  );
  const [transcription, setTranscription] = useState<Transcription | null>(
    null,
  );
  const [transcriptEdit, setTranscriptEdit] = useState("");
  const [preferences, setPreferences] = useState<Preferences>({
    whatsapp: true,
    push: false,
    email: false,
  });
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      device_name?: string;
      current: number;
      last_seen_at: string;
    }>
  >([]);
  const [privacyType, setPrivacyType] = useState<
    | "export"
    | "correction"
    | "deletion"
    | "consent_withdrawal"
    | "automated_routing_challenge"
  >("export");
  const [privacyDetails, setPrivacyDetails] = useState("");
  const [aiConversation, setAiConversation] = useState<AiConversation | null>(
    null,
  );
  const [aiMessage, setAiMessage] = useState("");
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const words = copy[language];
  const phone = `${country.dialCode}${nationalNumber.replace(/\D/gu, "").replace(/^0+/u, "")}`;

  useEffect(() => {
    void loadSession().then(setSession);
  }, []);
  useEffect(() => {
    if (session) void refreshMatters(session);
  }, [session]);
  useEffect(() => () => liveSocket.current?.close(), []);
  const location = useMemo(
    () =>
      stateChoices.find((item) => item.code === stateCode)?.name ?? stateCode,
    [stateCode],
  );
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp() {
    await run(async () => {
      const result = await api<{
        challengeId: string;
        devCode?: string;
        stagingTestLogin?: boolean;
      }>("/auth/otp/request", {
        method: "POST",
        headers: { "X-Device-Id": Platform.OS },
        body: JSON.stringify({
          channel: "whatsapp",
          phone,
          purpose: "sign_in",
          locale: language,
        }),
      });
      setChallengeId(result.challengeId);
      if (result.devCode) setOtp(result.devCode);
      setNotice(
        result.stagingTestLogin
          ? "Staging test login is ready. Enter the private six-digit test code."
          : language === "pcm"
            ? "We send six-digit code enter your WhatsApp."
            : "We sent a six-digit code through WhatsApp.",
      );
    });
  }
  async function verifyOtp() {
    await run(async () => {
      const result = await api<Session>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          challengeId,
          code: otp,
          deviceName: `${Platform.OS} Lex app`,
        }),
      });
      await saveSession(result);
      setSession(result);
    });
  }
  async function refreshMatters(active = session) {
    if (!active) return;
    setMatters(await api<Matter[]>("/matters", {}, active.accessToken));
  }

  async function startIntake() {
    if (!session) return;
    await run(async () => {
      let subjectId = clientSubjectId;
      if (clientType === "minor" && !subjectId) {
        if (!subjectName.trim() || !/^\d{4}-\d{2}-\d{2}$/u.test(subjectDetail))
          throw new Error(
            "Enter the minor's display name and date of birth as YYYY-MM-DD.",
          );
        const profile = await api<{ id: string; status: string }>(
          "/clients/minor",
          {
            method: "POST",
            body: JSON.stringify({
              displayName: subjectName.trim(),
              dateOfBirth: subjectDetail,
            }),
          },
          session.accessToken,
        );
        subjectId = profile.id;
        setClientSubjectId(profile.id);
        setNotice(
          "Protected minor profile created. Guardian verification or safeguarding review is required before detailed facts, evidence, lawyer sharing, or payment.",
        );
        return;
      }
      if (clientType === "organization" && !subjectId) {
        if (!subjectName.trim() || !subjectDetail.trim())
          throw new Error(
            "Enter the organization's legal name and registration number.",
          );
        const organization = await api<{ id: string; status: string }>(
          "/organizations",
          {
            method: "POST",
            body: JSON.stringify({
              legalName: subjectName.trim(),
              registrationNumber: subjectDetail.trim(),
              organizationType: "other",
            }),
          },
          session.accessToken,
        );
        subjectId = organization.id;
        setClientSubjectId(organization.id);
        setNotice(
          "Organization profile created. Operations must approve authority evidence before detailed intake, lawyer sharing, matching, or payment.",
        );
        return;
      }
      if (clientType !== "adult_individual") {
        setNotice(
          clientType === "minor"
            ? "Guardian verification is still pending."
            : "Organization authority review is still pending.",
        );
        return;
      }
      const created = await api<Intake>(
        "/intakes",
        {
          method: "POST",
          body: JSON.stringify({
            language,
            clientType,
            clientSubjectId: subjectId,
            practiceAreaCode,
            classificationStatus:
              practiceAreaCode === "not-sure" || practiceAreaCode === "other"
                ? "suggested"
                : "selected",
            issueRole: practiceAreaCode === "tenancy" ? role : undefined,
            tenancyRole: practiceAreaCode === "tenancy" ? role : undefined,
            countryCode: "NG",
            stateCode,
            sourceChannel: "mobile",
          }),
        },
        session.accessToken,
      );
      setIntake({ ...created, workflow: created.workflow ?? created.service! });
      setAnswers({});
      setSummary(null);
      setTranscription(null);
      setScreen("intake");
    });
  }
  function setAnswer(question: Question, value: unknown) {
    setAnswers((current) => ({ ...current, [question.key]: value }));
  }
  function toggleOption(question: Question, option: string) {
    const current = Array.isArray(answers[question.key])
      ? (answers[question.key] as string[])
      : [];
    setAnswer(
      question,
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    );
  }
  async function organizeFacts() {
    if (!session || !intake) return;
    await run(async () => {
      const result = await api<{ version: number }>(
        `/intakes/${intake.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            version: intake.version,
            narrative: String(
              answers.timeline ??
                "The client completed the guided legal intake.",
            ),
            desiredOutcome: String(
              answers.desired_outcome ?? "Lawyer-reviewed assessment",
            ),
            answers: Object.entries(answers).map(([questionKey, value]) => ({
              questionKey,
              value,
            })),
          }),
        },
        session.accessToken,
      );
      const organized = await api<Summary>(
        `/intakes/${intake.id}/summarize`,
        { method: "POST" },
        session.accessToken,
      );
      setIntake({
        ...intake,
        state: "awaiting_confirmation",
        version: organized.intakeVersion ?? result.version,
      });
      setSummary(organized);
    });
  }
  async function confirmAndSubmit() {
    if (!session || !intake || !summary) return;
    await run(async () => {
      const confirmed = await api<{ version: number }>(
        `/intakes/${intake.id}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            summaryConfirmed: true,
            consentAccepted: true,
            consentVersion: `pilot-${language}-v1-unapproved`,
            version: intake.version,
          }),
        },
        session.accessToken,
      );
      const createdMatter = await api<Matter>(
        `/intakes/${intake.id}/submit`,
        { method: "POST" },
        session.accessToken,
      );
      setIntake({ ...intake, version: confirmed.version });
      setNotice(
        createdMatter.state === "intake_only"
          ? `${location} is intake-only. Payment and matching are unavailable.`
          : "Matter submitted for eligible-lawyer matching.",
      );
      await refreshMatters();
      setScreen("home");
    });
  }

  async function uploadFile(
    uri: string,
    fileName: string,
    contentType: string,
    targetIntake = intake,
  ) {
    if (!session || !targetIntake)
      throw new Error("Start an intake before adding evidence");
    const blob = await (await fetch(uri)).blob();
    if (blob.size > 20 * 1024 * 1024)
      throw new Error("Evidence must be 20 MB or smaller");
    const digest = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      await blob.arrayBuffer(),
    );
    const checksum = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const response = await fetch(
      `${API_URL}/intakes/${targetIntake.id}/evidence`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": contentType,
          "Content-Length": String(blob.size),
          "X-File-Name": fileName,
          "X-File-Sha256": checksum,
        },
        body: blob,
      },
    );
    const result = (await response.json()) as { id?: string; message?: string };
    if (!response.ok || !result.id)
      throw new Error(result.message ?? "Secure evidence upload failed");
    setNotice(
      "Evidence uploaded privately and placed in synthetic-staging quarantine.",
    );
    return result.id;
  }
  async function chooseDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*", "audio/*"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0])
      await run(async () => {
        const file = result.assets[0]!;
        await uploadFile(
          file.uri,
          file.name,
          file.mimeType ?? "application/pdf",
        );
      });
  }
  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      return setNotice(
        "Camera access is used only when you choose to photograph evidence.",
      );
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0])
      await run(async () => {
        const file = result.assets[0]!;
        await uploadFile(
          file.uri,
          `evidence-${Date.now()}.jpg`,
          file.mimeType ?? "image/jpeg",
        );
      });
  }
  async function toggleVoice() {
    if (recorder.isRecording) {
      await recorder.stop();
      if (!recorder.uri || !session || !intake) return;
      await run(async () => {
        const response = await fetch(recorder.uri!);
        const voice = await response.blob();
        const evidenceId = await uploadFile(
          recorder.uri!,
          `voice-${Date.now()}.m4a`,
          voice.type || "audio/mp4",
        );
        const queued = await api<Transcription>(
          `/intakes/${intake.id}/transcriptions`,
          { method: "POST", body: JSON.stringify({ evidenceId, language }) },
          session.accessToken,
        );
        setTranscription(queued);
        setNotice(
          "Voice note is queued. Refresh the transcript before confirming it.",
        );
      });
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted)
      return setNotice(
        "Microphone access is used only when you choose to record a voice note.",
      );
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }
  async function refreshTranscript() {
    if (!session || !transcription) return;
    await run(async () => {
      const value = await api<Transcription>(
        `/transcriptions/${transcription.id}`,
        {},
        session.accessToken,
      );
      setTranscription(value);
      if (value.transcript) setTranscriptEdit(value.transcript);
    });
  }
  async function confirmTranscript() {
    if (!session || !transcription) return;
    await run(async () => {
      const value = await api<Transcription>(
        `/transcriptions/${transcription.id}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            transcript: transcriptEdit,
            version: transcription.version,
          }),
        },
        session.accessToken,
      );
      setTranscription(value);
      setAnswer(
        {
          key: "voice_transcript",
          label: "",
          type: "long_text",
          required: false,
        },
        transcriptEdit,
      );
      setNotice("Transcript confirmed and added to your intake facts.");
    });
  }

  async function openMatter(item: Matter) {
    if (!session) return;
    await run(async () => {
      const detail = await api<MatterDetail>(
        `/matters/${item.id}`,
        {},
        session.accessToken,
      );
      setMatter(detail);
      const engagements = await api<Array<{ id: string; matter_id: string }>>(
        "/engagements",
        {},
        session.accessToken,
      );
      const related = engagements.find((value) => value.matter_id === item.id);
      setEngagement(
        related
          ? await api<RepresentationEngagement>(
              `/engagements/${related.id}`,
              {},
              session.accessToken,
            )
          : null,
      );
      setScreen("matter");
    });
  }
  async function sendMessage() {
    if (!session || !matter || !messageBody.trim()) return;
    if (liveConnected && liveSocket.current?.readyState === WebSocket.OPEN) {
      liveSocket.current.send(
        JSON.stringify({
          type: "message",
          clientMessageId: Crypto.randomUUID(),
          body: messageBody.trim(),
        }),
      );
      setMessageBody("");
      return;
    }
    await run(async () => {
      await api(
        `/matters/${matter.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body: messageBody,
            channel: "mobile",
            attachmentIds: [],
          }),
        },
        session.accessToken,
      );
      setMessageBody("");
      await openMatter(matter);
    });
  }
  async function scheduleConsultation() {
    if (!session || !matter) return;
    await run(async () => {
      const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
      await api(
        "/consultations",
        {
          method: "POST",
          body: JSON.stringify({
            matterId: matter.id,
            startsAt,
            durationMinutes: 60,
            mode: "live_text",
            timeZone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              "Africa/Lagos",
            idempotencyKey: `mobile:${matter.id}:initial`,
          }),
        },
        session.accessToken,
      );
      await openMatter(matter);
      setNotice(
        "Consultation scheduled. Both participants can join through Lex.",
      );
    });
  }
  async function joinConsultation() {
    if (!session || !matter?.consultation) return;
    await run(async () => {
      liveSocket.current?.close();
      const token = await api<{ token: string }>(
        `/consultations/${matter.consultation!.id}/realtime-token`,
        { method: "POST" },
        session.accessToken,
      );
      const socketUrl = `${REALTIME_URL.replace(/^http/u, "ws")}/consultations/${matter.consultation!.id}`;
      const socket = new WebSocket(socketUrl, [
        "lex.realtime.v1",
        `bearer.${token.token}`,
      ]);
      liveSocket.current = socket;
      socket.onopen = () => {
        setLiveConnected(true);
        setNotice("Live text consultation connected.");
      };
      socket.onmessage = () => void openMatter(matter);
      socket.onerror = () =>
        setNotice(
          "Live consultation could not connect. Secure matter messages still work.",
        );
      socket.onclose = () => setLiveConnected(false);
    });
  }
  async function matterAction(kind: "reassignment" | "refund") {
    if (!session || !matter) return;
    await run(async () => {
      await api(
        `/matters/${matter.id}/${kind}`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: `${kind} requested through the client app`,
            version: matter.version,
          }),
        },
        session.accessToken,
      );
      setNotice(`${title(kind)} request recorded for human review.`);
      await refreshMatters();
      setScreen("home");
    });
  }
  async function pay(provider: "paystack" | "flutterwave") {
    if (!session || !matter) return;
    await run(async () => {
      const payment = await api<{ checkoutUrl: string }>(
        "/payments/initialize",
        {
          method: "POST",
          body: JSON.stringify({
            matterId: matter.id,
            provider,
            callbackUrl: "lex://payment-result",
          }),
        },
        session.accessToken,
      );
      await Linking.openURL(payment.checkoutUrl);
      setNotice(
        "Return to Lex after sandbox checkout. Server verification controls payment status.",
      );
    });
  }
  async function acceptRepresentation() {
    if (!session || !engagement) return;
    const offered = engagement.proposals.find(
      (proposal) => proposal.state === "offered",
    );
    if (!offered) return;
    await run(async () => {
      await api(
        `/engagements/${engagement.id}/accept`,
        {
          method: "POST",
          body: JSON.stringify({
            proposalVersion: offered.version,
            consentVersion: "representation-consent-v1",
            accepted: true,
          }),
        },
        session.accessToken,
      );
      if (matter) await openMatter(matter);
      setNotice(
        "Representation proposal accepted. The lawyer must reconfirm conflicts before any separate invoice can be paid.",
      );
    });
  }
  async function payInvoice(
    invoiceId: string,
    provider: "paystack" | "flutterwave",
  ) {
    if (!session) return;
    await run(async () => {
      const payment = await api<{ checkoutUrl: string }>(
        "/payments/initialize",
        {
          method: "POST",
          body: JSON.stringify({
            invoiceId,
            provider,
            callbackUrl: "lex://payment-result",
          }),
        },
        session.accessToken,
      );
      await Linking.openURL(payment.checkoutUrl);
      setNotice(
        "Return after sandbox checkout. The server verifies the invoice payment and direct split.",
      );
    });
  }

  async function loadSettings() {
    if (!session) return;
    await run(async () => {
      const [savedPreferences, activeSessions] = await Promise.all([
        api<Preferences>("/notification-preferences", {}, session.accessToken),
        api<typeof sessions>("/auth/sessions", {}, session.accessToken),
      ]);
      setPreferences({
        whatsapp: Boolean(savedPreferences.whatsapp),
        push: Boolean(savedPreferences.push),
        email: Boolean(savedPreferences.email),
      });
      setSessions(activeSessions);
      setScreen("settings");
    });
  }
  async function savePreferences(next: Preferences) {
    if (!session) return;
    await run(async () => {
      setPreferences(
        await api<Preferences>(
          "/notification-preferences",
          { method: "PUT", body: JSON.stringify(next) },
          session.accessToken,
        ),
      );
    });
  }
  async function enablePush() {
    if (!session) return;
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return setNotice("Push notifications remain off.");
    await run(async () => {
      const token = await Notifications.getExpoPushTokenAsync();
      await api(
        "/push-devices",
        {
          method: "POST",
          body: JSON.stringify({
            token: token.data,
            platform: Platform.OS,
            consent: true,
          }),
        },
        session.accessToken,
      );
      await savePreferences({ ...preferences, push: true });
    });
  }
  async function revokeSession(id: string) {
    if (!session) return;
    await run(async () => {
      await api(
        `/auth/sessions/${id}`,
        { method: "DELETE" },
        session.accessToken,
      );
      setSessions((current) => current.filter((item) => item.id !== id));
    });
  }
  async function createPrivacyRequest() {
    if (!session) return;
    await run(async () => {
      await api(
        "/privacy/requests",
        {
          method: "POST",
          body: JSON.stringify({
            type: privacyType,
            details: privacyDetails || undefined,
          }),
        },
        session.accessToken,
      );
      setPrivacyDetails("");
      setNotice("Request recorded with an auditable human-review deadline.");
    });
  }

  async function openAskLex() {
    if (!session) return;
    await run(async () => {
      const created = await api<AiConversation>(
        "/ai/intake-sessions",
        {
          method: "POST",
          body: JSON.stringify({
            channel: "mobile",
            language,
            aiDisclosureAccepted: true,
            aiDisclosureVersion: "ai-routing-disclosure-en-v1-staging-draft",
          }),
        },
        session.accessToken,
      );
      setAiConversation({ ...created, turns: [] });
      setScreen("ask");
    });
  }

  async function refreshAiConversation(id = aiConversation?.id) {
    if (!session || !id) return;
    const refreshed = await api<AiConversation>(
      `/ai/intake-sessions/${id}`,
      {},
      session.accessToken,
    );
    setAiConversation(refreshed);
  }

  async function sendAiMessage() {
    if (!session || !aiConversation || !aiMessage.trim()) return;
    const body = aiMessage.trim();
    setAiMessage("");
    await run(async () => {
      await api(
        `/ai/intake-sessions/${aiConversation.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body,
            clientMessageId: `${Date.now()}-${await Crypto.randomUUID()}`,
          }),
        },
        session.accessToken,
      );
      setAiConversation((current) => ({
        ...(current ?? aiConversation),
        state: "processing",
        turns: [
          ...(current?.turns ?? []),
          {
            id: `local-${Date.now()}`,
            actor: "client",
            body,
            status: "recorded",
            created_at: new Date().toISOString(),
          },
        ],
      }));
      setTimeout(() => void refreshAiConversation(aiConversation.id), 1_500);
    });
  }

  async function requestAiHumanReview(kind: "challenge" | "human-review") {
    if (!session || !aiConversation) return;
    await run(async () => {
      await api(
        `/ai/intake-sessions/${aiConversation.id}/${kind}`,
        { method: "POST" },
        session.accessToken,
      );
      await refreshAiConversation(aiConversation.id);
    });
  }

  async function confirmAiClassification() {
    if (!session || !aiConversation) return;
    let suggested = practiceAreaCode;
    try {
      const parsed = JSON.parse(aiConversation.classification_json ?? "{}") as {
        suggestedPracticeAreaCodes?: string[];
      };
      suggested = parsed.suggestedPracticeAreaCodes?.[0] ?? practiceAreaCode;
    } catch {
      // The client can still use the catalogue selection if a stale payload is malformed.
    }
    await run(async () => {
      await api(
        `/ai/intake-sessions/${aiConversation.id}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            practiceAreaCode: suggested,
            confirmed: true,
          }),
        },
        session.accessToken,
      );
      setPracticeAreaCode(suggested);
      setNotice(
        "AI-organized information confirmed. Continue through the guided intake to share it with a lawyer.",
      );
      setScreen("home");
    });
  }

  async function openLegalCentre() {
    if (!session) return;
    await run(async () => {
      const result = await api<{ items: LegalDocument[] }>(
        `/legal/documents?language=${language}`,
        {},
        session.accessToken,
      );
      setLegalDocuments(result.items);
      setScreen("legal");
    });
  }

  if (session === undefined)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#1e6248" />
      </View>
    );
  if (!session)
    return (
      <Auth
        language={language}
        setLanguage={setLanguage}
        country={country}
        setCountry={setCountry}
        nationalNumber={nationalNumber}
        setNationalNumber={setNationalNumber}
        challengeId={challengeId}
        otp={otp}
        setOtp={setOtp}
        busy={busy}
        notice={notice}
        requestOtp={requestOtp}
        verifyOtp={verifyOtp}
        useStagingTestNumber={() => {
          setCountry(COUNTRY_CODES[0]!);
          setNationalNumber(STAGING_TEST_PHONE.slice(4));
          setNotice(
            "Synthetic staging number selected. No WhatsApp message will be sent.",
          );
        }}
        resetChallenge={() => {
          setChallengeId("");
          setOtp("");
          setNotice("");
        }}
      />
    );
  if (screen === "intake" && intake)
    return (
      <IntakeScreen
        language={language}
        intake={intake}
        answers={answers}
        setAnswer={setAnswer}
        toggleOption={toggleOption}
        summary={summary}
        busy={busy}
        notice={notice}
        transcription={transcription}
        transcriptEdit={transcriptEdit}
        setTranscriptEdit={setTranscriptEdit}
        recorderActive={recorder.isRecording}
        back={() => setScreen("home")}
        organizeFacts={organizeFacts}
        confirmAndSubmit={confirmAndSubmit}
        chooseDocument={chooseDocument}
        takePhoto={takePhoto}
        toggleVoice={toggleVoice}
        refreshTranscript={refreshTranscript}
        confirmTranscript={confirmTranscript}
      />
    );
  if (screen === "matter" && matter)
    return (
      <MatterScreen
        matter={matter}
        messageBody={messageBody}
        setMessageBody={setMessageBody}
        busy={busy}
        notice={notice}
        back={() => setScreen("home")}
        sendMessage={sendMessage}
        pay={pay}
        matterAction={matterAction}
        liveConnected={liveConnected}
        scheduleConsultation={scheduleConsultation}
        joinConsultation={joinConsultation}
        engagement={engagement}
        acceptRepresentation={acceptRepresentation}
        payInvoice={payInvoice}
      />
    );
  if (screen === "settings")
    return (
      <Settings
        preferences={preferences}
        sessions={sessions}
        busy={busy}
        notice={notice}
        back={() => setScreen("home")}
        savePreferences={savePreferences}
        enablePush={enablePush}
        revokeSession={revokeSession}
        openPrivacy={() => setScreen("privacy")}
      />
    );
  if (screen === "privacy")
    return (
      <Privacy
        privacyType={privacyType}
        setPrivacyType={setPrivacyType}
        details={privacyDetails}
        setDetails={setPrivacyDetails}
        busy={busy}
        notice={notice}
        back={() => setScreen("settings")}
        submit={createPrivacyRequest}
      />
    );
  if (screen === "ask" && aiConversation)
    return (
      <AskLex
        conversation={aiConversation}
        message={aiMessage}
        setMessage={setAiMessage}
        busy={busy}
        notice={notice}
        back={() => setScreen("home")}
        send={sendAiMessage}
        refresh={() => refreshAiConversation()}
        confirm={confirmAiClassification}
        challenge={() => requestAiHumanReview("challenge")}
        humanReview={() => requestAiHumanReview("human-review")}
      />
    );
  if (screen === "legal")
    return (
      <LegalCentre documents={legalDocuments} back={() => setScreen("home")} />
    );
  return (
    <Home
      language={language}
      setLanguage={setLanguage}
      clientType={clientType}
      setClientType={(value) => {
        setClientType(value);
        setClientSubjectId(undefined);
        setSubjectName("");
        setSubjectDetail("");
      }}
      subjectName={subjectName}
      setSubjectName={setSubjectName}
      subjectDetail={subjectDetail}
      setSubjectDetail={setSubjectDetail}
      subjectReady={Boolean(clientSubjectId)}
      practiceAreaCode={practiceAreaCode}
      setPracticeAreaCode={setPracticeAreaCode}
      role={role}
      setRole={setRole}
      stateCode={stateCode}
      setStateCode={setStateCode}
      matters={matters}
      notice={notice}
      busy={busy}
      startIntake={startIntake}
      openAskLex={openAskLex}
      openLegalCentre={openLegalCentre}
      openMatter={openMatter}
      openSettings={loadSettings}
      signOut={async () => {
        await clearSession();
        setSession(null);
      }}
    />
  );
}

function Auth(props: {
  language: Language;
  setLanguage: (value: Language) => void;
  country: CountryCode;
  setCountry: (value: CountryCode) => void;
  nationalNumber: string;
  setNationalNumber: (value: string) => void;
  challengeId: string;
  otp: string;
  setOtp: (value: string) => void;
  busy: boolean;
  notice: string;
  requestOtp: () => void;
  verifyOtp: () => void;
  useStagingTestNumber: () => void;
  resetChallenge: () => void;
}) {
  const words = copy[props.language];
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.page}>
          <Brand />
          <Text style={styles.kicker}>NIGERIA-FIRST MANAGED LEGAL ACCESS</Text>
          <Text style={styles.hero}>{words.headline}</Text>
          <Text style={styles.body}>
            Lex organizes your confirmed facts and connects eligible matters
            nationwide with verified lawyers. It is not an emergency service or
            an automated legal adviser.
          </Text>
          <View style={styles.row}>
            <Chip
              label="English"
              active={props.language === "en"}
              onPress={() => props.setLanguage("en")}
            />
            <Chip
              label="Pidgin"
              active={props.language === "pcm"}
              onPress={() => props.setLanguage("pcm")}
            />
            <Chip
              label="Hausa"
              active={props.language === "ha"}
              onPress={() => props.setLanguage("ha")}
            />
            <Chip
              label="Yoruba"
              active={props.language === "yo"}
              onPress={() => props.setLanguage("yo")}
            />
            <Chip
              label="Igbo"
              active={props.language === "ig"}
              onPress={() => props.setLanguage("ig")}
            />
          </View>
          <Card>
            <Text style={styles.heading}>{words.welcome}</Text>
            {!props.challengeId ? (
              <>
                <Label text="WhatsApp phone number" />
                <CountryCodeDropdown
                  selected={props.country}
                  onSelect={props.setCountry}
                />
                <View style={styles.phoneRow}>
                  <View style={styles.dialCodeBox}>
                    <Text style={styles.dialCodeText}>
                      {props.country.dialCode}
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.phoneInput]}
                    value={props.nationalNumber}
                    onChangeText={props.setNationalNumber}
                    keyboardType="phone-pad"
                    placeholder="801 234 5678"
                    maxLength={15}
                  />
                </View>
                <Button
                  label={words.continue}
                  onPress={props.requestOtp}
                  busy={props.busy}
                  disabled={props.nationalNumber.replace(/\D/gu, "").length < 7}
                />
                {APP_ENV === "staging" ? (
                  <Button
                    secondary
                    label="Use staging test number"
                    onPress={props.useStagingTestNumber}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Label text={words.code} />
                <TextInput
                  style={styles.input}
                  value={props.otp}
                  onChangeText={props.setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Button
                  label={words.verify}
                  onPress={props.verifyOtp}
                  busy={props.busy}
                />
                <Button
                  secondary
                  label="Change phone number"
                  onPress={props.resetChallenge}
                />
              </>
            )}
            {props.notice ? <Notice text={props.notice} /> : null}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CountryCodeDropdown({
  selected,
  onSelect,
}: {
  selected: CountryCode;
  onSelect: (value: CountryCode) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.dropdownContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Select phone country code"
        onPress={() => setOpen((current) => !current)}
        style={styles.dropdownTrigger}
      >
        <Text style={styles.dropdownTriggerText}>
          {selected.country} ({selected.dialCode})
        </Text>
        <Text style={styles.dropdownArrow}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? (
        <View style={styles.dropdownMenu}>
          {COUNTRY_CODES.map((item) => (
            <Pressable
              key={`${item.iso}-${item.dialCode}`}
              accessibilityRole="button"
              onPress={() => {
                onSelect(item);
                setOpen(false);
              }}
              style={[
                styles.dropdownOption,
                item.iso === selected.iso && styles.dropdownOptionSelected,
              ]}
            >
              <Text style={styles.dropdownOptionCountry}>{item.country}</Text>
              <Text style={styles.dropdownOptionCode}>{item.dialCode}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Home(props: {
  language: Language;
  setLanguage: (value: Language) => void;
  clientType: ClientType;
  setClientType: (value: ClientType) => void;
  subjectName: string;
  setSubjectName: (value: string) => void;
  subjectDetail: string;
  setSubjectDetail: (value: string) => void;
  subjectReady: boolean;
  practiceAreaCode: string;
  setPracticeAreaCode: (value: string) => void;
  role: Role;
  setRole: (value: Role) => void;
  stateCode: string;
  setStateCode: (value: string) => void;
  matters: Matter[];
  notice: string;
  busy: boolean;
  startIntake: () => void;
  openAskLex: () => void;
  openLegalCentre: () => void;
  openMatter: (matter: Matter) => void;
  openSettings: () => void;
  signOut: () => void;
}) {
  const words = copy[props.language];
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [openCatalogGroup, setOpenCatalogGroup] = useState<string>();
  const [openSection, setOpenSection] = useState("language");
  const visiblePracticeAreas = PRACTICE_AREAS.filter((item) => {
    const query = catalogQuery.trim().toLowerCase();
    return (
      !query ||
      [item.name, item.group, item.description, ...item.keywords].some(
        (value) => value.toLowerCase().includes(query),
      )
    );
  });
  const selectedPracticeArea = PRACTICE_AREAS.find(
    (item) => item.code === props.practiceAreaCode,
  );
  const catalogueGroups = Array.from(
    PRACTICE_AREAS.reduce((groups, item) => {
      const entries = groups.get(item.group) ?? [];
      entries.push(item);
      groups.set(item.group, entries);
      return groups;
    }, new Map<string, Array<(typeof PRACTICE_AREAS)[number]>>()),
  );
  return (
    <Shell>
      <View style={styles.between}>
        <View>
          <Text style={styles.kicker}>LEX NATIONWIDE TEST RELEASE</Text>
          <Text style={styles.heading}>Good day.</Text>
        </View>
        <View style={styles.row}>
          <Button small label="Legal centre" onPress={props.openLegalCentre} />
          <Button small label="Settings" onPress={props.openSettings} />
        </View>
      </View>
      <Card dark>
        <Text style={styles.kickerLight}>MANAGED LEGAL ACCESS</Text>
        <Text style={styles.heroLight}>{words.headline}</Text>
        <Button
          light
          label={words.start}
          onPress={props.startIntake}
          busy={props.busy}
        />
        <Button
          outlineLight
          label="Ask Lex AI-assisted intake"
          onPress={props.openAskLex}
          busy={props.busy}
        />
      </Card>
      <AccordionSection
        label="Language"
        summary={title(props.language === "pcm" ? "Pidgin" : props.language)}
        open={openSection === "language"}
        onToggle={() =>
          setOpenSection(openSection === "language" ? "" : "language")
        }
      >
        <View style={styles.row}>
          <Chip
            label="English"
            active={props.language === "en"}
            onPress={() => {
              props.setLanguage("en");
              setOpenSection("client");
            }}
          />
          <Chip
            label="Pidgin"
            active={props.language === "pcm"}
            onPress={() => {
              props.setLanguage("pcm");
              setOpenSection("client");
            }}
          />
          <Chip
            label="Hausa"
            active={props.language === "ha"}
            onPress={() => {
              props.setLanguage("ha");
              setOpenSection("client");
            }}
          />
          <Chip
            label="Yoruba"
            active={props.language === "yo"}
            onPress={() => {
              props.setLanguage("yo");
              setOpenSection("client");
            }}
          />
          <Chip
            label="Igbo"
            active={props.language === "ig"}
            onPress={() => {
              props.setLanguage("ig");
              setOpenSection("client");
            }}
          />
        </View>
      </AccordionSection>
      <AccordionSection
        label="Who needs help?"
        summary={title(props.clientType)}
        open={openSection === "client"}
        onToggle={() =>
          setOpenSection(openSection === "client" ? "" : "client")
        }
      >
        <View style={styles.wrap}>
          <Chip
            label="Adult individual"
            active={props.clientType === "adult_individual"}
            onPress={() => {
              props.setClientType("adult_individual");
              setOpenSection("location");
            }}
          />
          <Chip
            label="Person under 18"
            active={props.clientType === "minor"}
            onPress={() => props.setClientType("minor")}
          />
          <Chip
            label="Organization"
            active={props.clientType === "organization"}
            onPress={() => props.setClientType("organization")}
          />
        </View>
        {props.clientType !== "adult_individual" ? (
          <>
            <Label
              text={
                props.clientType === "minor"
                  ? "Minor display name"
                  : "Organization legal name"
              }
            />
            <TextInput
              style={styles.input}
              value={props.subjectName}
              onChangeText={props.setSubjectName}
            />
            <Label
              text={
                props.clientType === "minor"
                  ? "Date of birth (YYYY-MM-DD)"
                  : "Registration number"
              }
            />
            <TextInput
              style={styles.input}
              value={props.subjectDetail}
              onChangeText={props.setSubjectDetail}
            />
            <Notice
              text={
                props.subjectReady
                  ? "Protected profile exists and is awaiting the required human verification."
                  : props.clientType === "minor"
                    ? "Tap Get legal help to create only a minimal protected profile. Detailed facts, evidence, lawyer sharing and payment stay locked until verified guardian consent or safeguarding review."
                    : "Tap Get legal help to create the organization record. Authority review must be approved before detailed intake, lawyer sharing, matching or payment."
              }
            />
          </>
        ) : null}
      </AccordionSection>
      <AccordionSection
        label="Location"
        summary={
          stateChoices.find((item) => item.code === props.stateCode)?.name ??
          props.stateCode
        }
        open={openSection === "location"}
        onToggle={() =>
          setOpenSection(openSection === "location" ? "" : "location")
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {stateChoices.map((item) => (
            <Chip
              key={item.code}
              label={item.name}
              active={props.stateCode === item.code}
              onPress={() => {
                props.setStateCode(item.code);
                setOpenSection("legal");
              }}
            />
          ))}
        </ScrollView>
        <Notice text="All states and the FCT are enabled for synthetic testing. If no verified eligible lawyer is available, operations assists before conflict review or payment." />
      </AccordionSection>
      <AccordionSection
        label="Legal issue"
        summary={selectedPracticeArea?.name ?? "Not sure"}
        open={openSection === "legal"}
        onToggle={() => setOpenSection(openSection === "legal" ? "" : "legal")}
      >
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Search legal issue catalogue"
            style={[styles.input, styles.searchInput]}
            value={catalogQuery}
            onChangeText={setCatalogQuery}
            placeholder="Search police, divorce, debt…"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: catalogOpen }}
            accessibilityLabel="Browse grouped legal issue catalogue"
            style={styles.catalogTrigger}
            onPress={() => setCatalogOpen((current) => !current)}
          >
            <Text style={styles.catalogTriggerText}>
              {catalogOpen ? "Close" : "Browse"} ▾
            </Text>
          </Pressable>
        </View>
        {catalogQuery.trim() ? (
          <View style={styles.catalog}>
            {visiblePracticeAreas.map((item) => (
              <Chip
                key={item.code}
                label={item.name}
                active={props.practiceAreaCode === item.code}
                onPress={() => {
                  props.setPracticeAreaCode(item.code);
                  setCatalogQuery("");
                  setOpenSection(
                    item.code === "tenancy" ? "addendum" : "consultation",
                  );
                }}
              />
            ))}
          </View>
        ) : null}
        {catalogOpen ? (
          <View style={styles.catalogBranches}>
            {catalogueGroups.map(([group, items]) => (
              <View key={group}>
                <Pressable
                  style={styles.branchHeader}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openCatalogGroup === group }}
                  onPress={() =>
                    setOpenCatalogGroup(
                      openCatalogGroup === group ? undefined : group,
                    )
                  }
                >
                  <Text style={styles.strong}>{group}</Text>
                  <Text style={styles.arrow}>
                    {openCatalogGroup === group ? "−" : "+"}
                  </Text>
                </Pressable>
                {openCatalogGroup === group ? (
                  <View style={styles.catalog}>
                    {items.map((item) => (
                      <Chip
                        key={item.code}
                        label={item.name}
                        active={props.practiceAreaCode === item.code}
                        onPress={() => {
                          props.setPracticeAreaCode(item.code);
                          setCatalogOpen(false);
                          setOpenSection(
                            item.code === "tenancy"
                              ? "addendum"
                              : "consultation",
                          );
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {selectedPracticeArea ? (
          <Notice text={selectedPracticeArea.description} />
        ) : null}
        {visiblePracticeAreas.length === 0 ? (
          <Notice text="No matching category. Choose Other or Not sure so Lex operations can help classify it." />
        ) : null}
      </AccordionSection>
      {props.practiceAreaCode === "tenancy" ? (
        <AccordionSection
          label="Issue-specific questions"
          summary={title(props.role)}
          open={openSection === "addendum"}
          onToggle={() =>
            setOpenSection(openSection === "addendum" ? "" : "addendum")
          }
        >
          <View style={styles.row}>
            <Chip
              label={words.tenant}
              active={props.role === "tenant"}
              onPress={() => {
                props.setRole("tenant");
                setOpenSection("consultation");
              }}
            />
            <Chip
              label={words.landlord}
              active={props.role === "landlord"}
              onPress={() => {
                props.setRole("landlord");
                setOpenSection("consultation");
              }}
            />
          </View>
        </AccordionSection>
      ) : null}
      <AccordionSection
        label="Consultation preferences"
        summary="Live text, voice notes and secure messages"
        open={openSection === "consultation"}
        onToggle={() =>
          setOpenSection(openSection === "consultation" ? "" : "consultation")
        }
      >
        <Notice text="The test release supports scheduled live text, asynchronous voice notes, documents and secure messages. Native audio and video calls are not included." />
        <Button
          label="Review and continue"
          onPress={() => setOpenSection("review")}
        />
      </AccordionSection>
      <AccordionSection
        label="Review and continue"
        summary={`${selectedPracticeArea?.name ?? "Not sure"} · ${stateChoices.find((item) => item.code === props.stateCode)?.name ?? props.stateCode}`}
        open={openSection === "review"}
        onToggle={() =>
          setOpenSection(openSection === "review" ? "" : "review")
        }
      >
        <Notice text="Lex will collect category-specific facts next. AI-organized information must be reviewed and confirmed before it can be shared with a lawyer." />
        <Button
          label={words.start}
          onPress={props.startIntake}
          busy={props.busy}
        />
      </AccordionSection>
      <Section label="Your matters">
        {props.matters.length === 0 ? (
          <Card>
            <Text style={styles.body}>No matters yet.</Text>
          </Card>
        ) : (
          props.matters.map((matter) => (
            <Pressable
              key={matter.id}
              style={styles.listItem}
              onPress={() => props.openMatter(matter)}
            >
              <View style={styles.grow}>
                <Text style={styles.strong}>{matter.reference}</Text>
                <Text style={styles.meta}>
                  {title(matter.state)} · {title(matter.urgency)}
                </Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))
        )}
      </Section>
      {props.notice ? <Notice text={props.notice} /> : null}
      <Pressable onPress={props.signOut}>
        <Text style={styles.danger}>Sign out</Text>
      </Pressable>
    </Shell>
  );
}

function AskLex(props: {
  conversation: AiConversation;
  message: string;
  setMessage: (value: string) => void;
  busy: boolean;
  notice: string;
  back: () => void;
  send: () => void;
  refresh: () => void;
  confirm: () => void;
  challenge: () => void;
  humanReview: () => void;
}) {
  return (
    <Shell back={props.back} title="Ask Lex">
      <Card dark>
        <Text style={styles.kickerLight}>LEX AI-ASSISTED INTAKE</Text>
        <Text style={styles.heroLight}>
          Explain the issue in your own words.
        </Text>
        <Text style={styles.bodyLight}>
          Powered by OpenAI in this test release. Lex organizes facts and
          suggests a category; it does not give legal advice. You must confirm
          any AI-organized information before lawyer sharing.
        </Text>
      </Card>
      <View style={styles.statusRow}>
        <Text style={styles.statusPill}>{title(props.conversation.state)}</Text>
        <Text style={styles.meta}>
          {props.conversation.provider === "openai"
            ? "OpenAI configured"
            : "Safe fallback available"}
        </Text>
      </View>
      <Section label="Conversation">
        {(props.conversation.turns ?? []).length === 0 ? (
          <Notice text="Start by describing what happened, where it happened, and whether anyone is in immediate danger or detention." />
        ) : (
          props.conversation.turns?.map((turn) => (
            <View
              key={turn.id}
              style={[
                styles.chatBubble,
                turn.actor === "client"
                  ? styles.chatBubbleClient
                  : styles.chatBubbleLex,
              ]}
            >
              <Text style={styles.chatActor}>
                {turn.actor === "client" ? "You" : "Lex AI"}
              </Text>
              <Text style={styles.body}>{turn.body}</Text>
            </View>
          ))
        )}
        <TextInput
          style={[styles.input, styles.longInput]}
          multiline
          value={props.message}
          onChangeText={props.setMessage}
          placeholder="Describe the legal issue or answer Lex's question"
        />
        <Button
          label="Send securely"
          onPress={props.send}
          busy={props.busy}
          disabled={!props.message.trim()}
        />
        <Button secondary label="Refresh response" onPress={props.refresh} />
      </Section>
      {props.conversation.state === "awaiting_confirmation" ? (
        <Card>
          <Text style={styles.heading}>Needs your confirmation</Text>
          <Text style={styles.body}>
            Inspect the suggested category and organized facts. Confirm only if
            they reflect what you said; otherwise continue the conversation or
            challenge the routing.
          </Text>
          <Button label="Confirm suggested category" onPress={props.confirm} />
          <Button
            secondary
            label="Challenge this routing"
            onPress={props.challenge}
          />
        </Card>
      ) : null}
      {props.conversation.state === "human_review" ? (
        <Notice text="This enquiry has been routed to restricted human review because you requested it or the issue may be urgent, sensitive or uncertain." />
      ) : null}
      <Button
        secondary
        label="Request human review"
        onPress={props.humanReview}
      />
      {props.notice ? <Notice text={props.notice} /> : null}
    </Shell>
  );
}

function LegalCentre(props: { documents: LegalDocument[]; back: () => void }) {
  const [openDocument, setOpenDocument] = useState<string>();
  return (
    <Shell back={props.back} title="Legal centre">
      <Card dark>
        <Text style={styles.kickerLight}>LEX LEGAL CENTRE</Text>
        <Text style={styles.heroLight}>Legal documents and disclosures</Text>
        <Text style={styles.bodyLight}>
          Read effective policies and disclosures here. New drafts do not
          replace the version that applies to your service until publication.
        </Text>
      </Card>
      {!props.documents.length ? (
        <Notice text="No policies are published in your selected language yet. This private test release is not open for real legal matters." />
      ) : null}
      {props.documents.map((document) => (
        <AccordionSection
          key={document.version_id}
          label={document.title}
          summary={`Version ${document.version} · ${title(document.status)}`}
          open={openDocument === document.version_id}
          onToggle={() =>
            setOpenDocument(
              openDocument === document.version_id
                ? undefined
                : document.version_id,
            )
          }
        >
          {document.company_placeholder_present ? (
            <Notice text="Parent-company details and legal approval are still required before production publication." />
          ) : null}
          <Text style={styles.legalText}>{document.content_markdown}</Text>
        </AccordionSection>
      ))}
    </Shell>
  );
}

function IntakeScreen(props: {
  language: Language;
  intake: Intake;
  answers: Record<string, unknown>;
  setAnswer: (question: Question, value: unknown) => void;
  toggleOption: (question: Question, option: string) => void;
  summary: Summary | null;
  busy: boolean;
  notice: string;
  transcription: Transcription | null;
  transcriptEdit: string;
  setTranscriptEdit: (value: string) => void;
  recorderActive: boolean;
  back: () => void;
  organizeFacts: () => void;
  confirmAndSubmit: () => void;
  chooseDocument: () => void;
  takePhoto: () => void;
  toggleVoice: () => void;
  refreshTranscript: () => void;
  confirmTranscript: () => void;
}) {
  const missing = props.intake.workflow.questions.some(
    (question) =>
      question.required &&
      (props.answers[question.key] === undefined ||
        props.answers[question.key] === "" ||
        (Array.isArray(props.answers[question.key]) &&
          (props.answers[question.key] as unknown[]).length === 0)),
  );
  return (
    <Shell back={props.back} title={props.intake.workflow.title}>
      <Notice text={props.intake.workflow.disclosure} />
      {!props.summary ? (
        <>
          {props.intake.workflow.questions.map((question) => (
            <QuestionField
              key={question.key}
              question={question}
              value={props.answers[question.key]}
              setAnswer={props.setAnswer}
              toggleOption={props.toggleOption}
            />
          ))}
          <Section label="Evidence and voice">
            <View style={styles.row}>
              <Button small label="Document" onPress={props.chooseDocument} />
              <Button small label="Photo" onPress={props.takePhoto} />
              <Button
                small
                label={props.recorderActive ? "Stop" : "Voice"}
                onPress={props.toggleVoice}
              />
            </View>
            {props.transcription ? (
              <Card>
                <Text style={styles.strong}>
                  Voice transcript · {title(props.transcription.status)}
                </Text>
                {props.transcription.status === "queued" ? (
                  <Button
                    small
                    label="Refresh transcript"
                    onPress={props.refreshTranscript}
                  />
                ) : null}
                {props.transcription.transcript &&
                props.transcription.status === "ready" ? (
                  <>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      multiline
                      value={props.transcriptEdit}
                      onChangeText={props.setTranscriptEdit}
                    />
                    <Button
                      label="Confirm corrected transcript"
                      onPress={props.confirmTranscript}
                    />
                  </>
                ) : null}
              </Card>
            ) : null}
          </Section>
          <Button
            label="Organize my facts"
            onPress={props.organizeFacts}
            busy={props.busy}
            disabled={missing}
          />
        </>
      ) : (
        <>
          <Text style={styles.kicker}>CONFIRM BEFORE SHARING</Text>
          <Text style={styles.heading}>Is this accurate?</Text>
          <Card>
            <Text style={styles.strong}>{props.summary.summary}</Text>
            {props.summary.facts.map((fact, index) => (
              <Text style={styles.body} key={`${fact}-${index}`}>
                • {fact}
              </Text>
            ))}
          </Card>
          {props.summary.missingInformation.length ? (
            <Notice
              text={`Missing information: ${props.summary.missingInformation.join(", ")}`}
            />
          ) : null}
          <Notice text={props.summary.safeClientConfirmation} />
          <Button
            label={copy[props.language].submit}
            onPress={props.confirmAndSubmit}
            busy={props.busy}
          />
        </>
      )}
      {props.notice ? <Notice text={props.notice} /> : null}
    </Shell>
  );
}

function QuestionField({
  question,
  value,
  setAnswer,
  toggleOption,
}: {
  question: Question;
  value: unknown;
  setAnswer: (question: Question, value: unknown) => void;
  toggleOption: (question: Question, option: string) => void;
}) {
  return (
    <View style={styles.question}>
      <Label text={`${question.label}${question.required ? " *" : ""}`} />
      {question.type === "boolean" ? (
        <View style={styles.row}>
          <Chip
            label="Yes"
            active={value === true}
            onPress={() => setAnswer(question, true)}
          />
          <Chip
            label="No"
            active={value === false}
            onPress={() => setAnswer(question, false)}
          />
        </View>
      ) : question.type === "multi_select" ? (
        <View style={styles.wrap}>
          {question.options?.map((option) => (
            <Chip
              key={option}
              label={title(option)}
              active={Array.isArray(value) && value.includes(option)}
              onPress={() => toggleOption(question, option)}
            />
          ))}
        </View>
      ) : (
        <TextInput
          style={[
            styles.input,
            question.type === "long_text" && styles.textarea,
          ]}
          multiline={question.type === "long_text"}
          value={typeof value === "string" ? value : ""}
          onChangeText={(text) => setAnswer(question, text)}
          keyboardType={question.type === "money" ? "numeric" : "default"}
          placeholder={question.type === "date" ? "YYYY-MM-DD" : undefined}
        />
      )}
    </View>
  );
}

function MatterScreen(props: {
  matter: MatterDetail;
  messageBody: string;
  setMessageBody: (value: string) => void;
  busy: boolean;
  notice: string;
  back: () => void;
  sendMessage: () => void;
  pay: (provider: "paystack" | "flutterwave") => void;
  matterAction: (kind: "reassignment" | "refund") => void;
  liveConnected: boolean;
  scheduleConsultation: () => void;
  joinConsultation: () => void;
  engagement: RepresentationEngagement | null;
  acceptRepresentation: () => void;
  payInvoice: (invoiceId: string, provider: "paystack" | "flutterwave") => void;
}) {
  const assessment = props.matter.assessment;
  return (
    <Shell back={props.back} title={props.matter.reference}>
      <Card dark>
        <Text style={styles.kickerLight}>{title(props.matter.state)}</Text>
        <Text style={styles.heroLight}>
          {title(props.matter.practice_area_code ?? "legal matter")}
        </Text>
        <Text style={styles.bodyLight}>
          {props.matter.state_code === "LA" ? "Lagos" : props.matter.state_code}{" "}
          · {title(props.matter.urgency)}
        </Text>
      </Card>
      {assessment ? (
        <Section label="Lawyer-reviewed assessment">
          <Card>
            <Text style={styles.heading}>{assessment.title}</Text>
            <Text style={styles.body}>{assessment.body}</Text>
            <Notice text={assessment.limitations} />
          </Card>
        </Section>
      ) : null}
      <Section label="Matter messages">
        {props.matter.messages.map((message) => (
          <Card key={message.id}>
            <Text style={styles.body}>{message.body}</Text>
            <Text style={styles.meta}>
              {new Date(message.created_at).toLocaleString()}
            </Text>
          </Card>
        ))}
        <TextInput
          style={[styles.input, styles.textareaSmall]}
          multiline
          value={props.messageBody}
          onChangeText={props.setMessageBody}
          placeholder="Write a private message"
        />
        <Button
          label="Send message"
          onPress={props.sendMessage}
          busy={props.busy}
          disabled={!props.messageBody.trim()}
        />
      </Section>
      {props.matter.state === "awaiting_payment" ? (
        <Section label="Sandbox payment">
          <Button
            label="Pay with Paystack"
            onPress={() => props.pay("paystack")}
          />
          <Button
            secondary
            label="Pay with Flutterwave"
            onPress={() => props.pay("flutterwave")}
          />
        </Section>
      ) : null}
      {props.matter.state === "consultation_scheduled" ? (
        <Section label="Scheduled in-app consultation">
          {props.matter.consultation ? (
            <>
              <Card>
                <Text style={styles.strong}>Live text with your lawyer</Text>
                <Text style={styles.meta}>
                  {props.matter.consultation.scheduled_start
                    ? new Date(
                        props.matter.consultation.scheduled_start,
                      ).toLocaleString()
                    : "Time recorded in the shared matter"}
                </Text>
              </Card>
              <Button
                label={
                  props.liveConnected
                    ? "Live consultation connected"
                    : "Join live text consultation"
                }
                onPress={props.joinConsultation}
                disabled={props.liveConnected}
              />
            </>
          ) : (
            <Button
              label="Schedule a one-hour live text consultation"
              onPress={props.scheduleConsultation}
            />
          )}
          <Notice text="Secure text is coordinated live and saved to the authoritative matter timeline. Native audio and video calls are not included." />
        </Section>
      ) : null}
      {props.matter.state === "consultation_active" &&
      props.matter.consultation ? (
        <Section label="Live consultation">
          <Button
            label={
              props.liveConnected
                ? "Connected — send below"
                : "Reconnect live consultation"
            }
            onPress={props.joinConsultation}
            disabled={props.liveConnected}
          />
        </Section>
      ) : null}
      {props.engagement ? (
        <Section label="Separate representation engagement">
          <Card>
            <Text style={styles.strong}>{title(props.engagement.state)}</Text>
            <Text style={styles.body}>
              Representation is offered by the identified lawyer or firm under a
              separate scope, exclusions, responsibilities, fees and
              cancellation terms.
            </Text>
          </Card>
          {props.engagement.proposals
            .filter((proposal) => proposal.state === "offered")
            .map((proposal) => (
              <Card key={proposal.id}>
                <Text style={styles.heading}>Proposal to review</Text>
                <Text style={styles.strong}>Scope</Text>
                <Text style={styles.body}>{proposal.scope}</Text>
                <Text style={styles.strong}>Exclusions</Text>
                <Text style={styles.body}>{proposal.exclusions}</Text>
                <Text style={styles.strong}>Fees</Text>
                <Text style={styles.body}>{proposal.fee_summary}</Text>
                <Text style={styles.strong}>Expected expenses</Text>
                <Text style={styles.body}>
                  {proposal.expected_expenses || "None stated"}
                </Text>
                <Text style={styles.strong}>Cancellation</Text>
                <Text style={styles.body}>{proposal.cancellation_terms}</Text>
                <Text style={styles.strong}>Your responsibilities</Text>
                <Text style={styles.body}>
                  {proposal.client_responsibilities}
                </Text>
                <Button
                  label="Accept separate representation proposal"
                  onPress={props.acceptRepresentation}
                />
              </Card>
            ))}
          {props.engagement.milestones.map((milestone) => (
            <Card key={milestone.id}>
              <Text style={styles.strong}>{milestone.title}</Text>
              <Text style={styles.meta}>
                {title(milestone.state)}
                {milestone.amount_minor
                  ? ` · ₦${(milestone.amount_minor / 100).toLocaleString()}`
                  : ""}
              </Text>
            </Card>
          ))}
          {props.engagement.invoices
            .filter((invoice) =>
              ["issued", "payment_pending"].includes(invoice.state),
            )
            .map((invoice) => (
              <Card key={invoice.id}>
                <Text style={styles.strong}>{invoice.invoice_number}</Text>
                <Text style={styles.body}>{invoice.description}</Text>
                <Text style={styles.meta}>
                  ₦{(invoice.amount_minor / 100).toLocaleString()} ·{" "}
                  {title(invoice.state)}
                </Text>
                {invoice.state === "issued" ? (
                  <>
                    <Button
                      label="Pay invoice with Paystack"
                      onPress={() => props.payInvoice(invoice.id, "paystack")}
                    />
                    <Button
                      secondary
                      label="Pay with Flutterwave"
                      onPress={() =>
                        props.payInvoice(invoice.id, "flutterwave")
                      }
                    />
                  </>
                ) : null}
              </Card>
            ))}
          <Notice text="Lex does not hold client money, calculate legal deadlines, file documents, appear in court, or guarantee an outcome. Each provider-verified invoice is separate and audited." />
        </Section>
      ) : null}
      {[
        "consultation_scheduled",
        "consultation_active",
        "awaiting_client",
        "lawyer_review",
        "delivered",
      ].includes(props.matter.state) ? (
        <Section label="Delivery problem">
          <Button
            secondary
            label="Request reassignment"
            onPress={() => props.matterAction("reassignment")}
          />
          <Button
            danger
            label="Request full refund"
            onPress={() => props.matterAction("refund")}
          />
        </Section>
      ) : null}
      <Notice text="Only a lawyer can attest and deliver a legal assessment. Urgent flags go to people; Lex is not an emergency service." />
      {props.notice ? <Notice text={props.notice} /> : null}
    </Shell>
  );
}

function Settings(props: {
  preferences: Preferences;
  sessions: Array<{
    id: string;
    device_name?: string;
    current: number;
    last_seen_at: string;
  }>;
  busy: boolean;
  notice: string;
  back: () => void;
  savePreferences: (value: Preferences) => void;
  enablePush: () => void;
  revokeSession: (id: string) => void;
  openPrivacy: () => void;
}) {
  return (
    <Shell back={props.back} title="Settings">
      <Section label="Notifications">
        <Toggle
          label="WhatsApp status updates"
          value={props.preferences.whatsapp}
          onChange={(value) =>
            props.savePreferences({ ...props.preferences, whatsapp: value })
          }
        />
        <Toggle
          label="Push notifications"
          value={props.preferences.push}
          onChange={(value) =>
            value
              ? props.enablePush()
              : props.savePreferences({ ...props.preferences, push: false })
          }
        />
        <Toggle
          label="Email (provider unavailable)"
          value={props.preferences.email}
          onChange={() => undefined}
          disabled
        />
      </Section>
      <Section label="Active sessions">
        {props.sessions.map((item) => (
          <Card key={item.id}>
            <Text style={styles.strong}>
              {item.device_name ?? "Lex device"}
              {item.current ? " · Current" : ""}
            </Text>
            <Text style={styles.meta}>
              Last seen {new Date(item.last_seen_at).toLocaleString()}
            </Text>
            {!item.current ? (
              <Button
                small
                danger
                label="Revoke"
                onPress={() => props.revokeSession(item.id)}
              />
            ) : null}
          </Card>
        ))}
      </Section>
      <Button
        secondary
        label="Privacy and routing requests"
        onPress={props.openPrivacy}
      />
      {props.notice ? <Notice text={props.notice} /> : null}
    </Shell>
  );
}

function Privacy(props: {
  privacyType:
    | "export"
    | "correction"
    | "deletion"
    | "consent_withdrawal"
    | "automated_routing_challenge";
  setPrivacyType: (
    value:
      | "export"
      | "correction"
      | "deletion"
      | "consent_withdrawal"
      | "automated_routing_challenge",
  ) => void;
  details: string;
  setDetails: (value: string) => void;
  busy: boolean;
  notice: string;
  back: () => void;
  submit: () => void;
}) {
  const types = [
    "export",
    "correction",
    "deletion",
    "consent_withdrawal",
    "automated_routing_challenge",
  ] as const;
  return (
    <Shell back={props.back} title="Privacy and human review">
      <Text style={styles.body}>
        Request a copy, correction, deletion review, consent withdrawal, or a
        human challenge to automated routing.
      </Text>
      <View style={styles.wrap}>
        {types.map((item) => (
          <Chip
            key={item}
            label={title(item)}
            active={props.privacyType === item}
            onPress={() => props.setPrivacyType(item)}
          />
        ))}
      </View>
      <Label text="Details" />
      <TextInput
        style={[styles.input, styles.textarea]}
        multiline
        value={props.details}
        onChangeText={props.setDetails}
      />
      <Button
        label="Submit auditable request"
        onPress={props.submit}
        busy={props.busy}
      />
      {props.notice ? <Notice text={props.notice} /> : null}
    </Shell>
  );
}

function Shell({
  children,
  back,
  title: screenTitle,
}: {
  children: React.ReactNode;
  back?: () => void;
  title?: string;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      {back ? (
        <View style={styles.top}>
          <Pressable onPress={back}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.topTitle}>{screenTitle}</Text>
          <View style={{ width: 32 }} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.page}>{children}</ScrollView>
    </SafeAreaView>
  );
}
function Brand() {
  return (
    <View style={styles.brand}>
      <Text style={styles.brandText}>L</Text>
    </View>
  );
}
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.kicker}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}
function AccordionSection({
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.accordion}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={
          open ? "Collapses this section" : "Expands this section"
        }
        onPress={onToggle}
        style={styles.accordionHeader}
      >
        <View style={styles.grow}>
          <Text style={styles.kicker}>{label.toUpperCase()}</Text>
          <Text style={styles.accordionSummary} numberOfLines={2}>
            {summary}
          </Text>
        </View>
        <Text style={styles.accordionChevron}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}
function Card({
  children,
  dark,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return <View style={[styles.card, dark && styles.cardDark]}>{children}</View>;
}
function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}
function Notice({ text }: { text: string }) {
  return <Text style={styles.notice}>{text}</Text>;
}
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Button({
  label,
  onPress,
  busy,
  disabled,
  secondary,
  danger,
  light,
  outlineLight,
  small,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  light?: boolean;
  outlineLight?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        light && styles.buttonLight,
        outlineLight && styles.buttonOutlineLight,
        small && styles.buttonSmall,
        (busy || disabled) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={light ? "#123c2d" : "white"} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            (secondary || light) && styles.buttonTextDark,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.strong}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: "#1e6248" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f3ec" },
  flex: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f3ec",
  },
  page: { padding: 22, paddingBottom: 60, gap: 13 },
  brand: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#c99146",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  brandText: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 30,
    fontWeight: "700",
    color: "#17241d",
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: "#a66a25",
    marginBottom: 7,
  },
  kickerLight: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: "#d8ae76",
    marginBottom: 7,
  },
  hero: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 38,
    lineHeight: 44,
    color: "#17241d",
  },
  heroLight: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 29,
    lineHeight: 35,
    color: "white",
  },
  heading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 25,
    lineHeight: 31,
    color: "#17241d",
  },
  body: { fontSize: 14, lineHeight: 22, color: "#5c6962" },
  bodyLight: { fontSize: 13, lineHeight: 20, color: "#cbd9d1" },
  label: { fontSize: 12, fontWeight: "700", color: "#34453c", marginTop: 4 },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#cfd3cd",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#17241d",
  },
  phoneRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  dialCodeBox: {
    minWidth: 72,
    backgroundColor: "#eef1ec",
    borderWidth: 1,
    borderColor: "#cfd3cd",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  dialCodeText: { color: "#17241d", fontSize: 15, fontWeight: "800" },
  phoneInput: { flex: 1 },
  dropdownContainer: { position: "relative", zIndex: 10 },
  dropdownTrigger: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cfd3cd",
    borderRadius: 12,
    backgroundColor: "white",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownTriggerText: { color: "#17241d", fontSize: 14, fontWeight: "700" },
  dropdownArrow: { color: "#1e6248", fontSize: 11 },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: "#cfd3cd",
    borderRadius: 12,
    backgroundColor: "white",
    overflow: "hidden",
  },
  dropdownOption: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e5df",
  },
  dropdownOptionSelected: { backgroundColor: "#e5f0e8" },
  dropdownOptionCountry: { color: "#17241d", fontSize: 13 },
  dropdownOptionCode: { color: "#1e6248", fontWeight: "800", fontSize: 13 },
  textarea: { minHeight: 120, textAlignVertical: "top" },
  textareaSmall: { minHeight: 80, textAlignVertical: "top" },
  card: {
    backgroundColor: "#fffefa",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#dedfd7",
    gap: 10,
  },
  cardDark: { backgroundColor: "#123c2d", borderColor: "#123c2d" },
  notice: {
    backgroundColor: "#fff5dc",
    borderWidth: 1,
    borderColor: "#ead3a5",
    borderRadius: 10,
    padding: 12,
    color: "#725322",
    fontSize: 12,
    lineHeight: 18,
  },
  row: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  wrap: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  catalog: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: { flex: 1, minWidth: 0 },
  catalogTrigger: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e6248",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f8f4",
  },
  catalogTriggerText: { color: "#123c2d", fontSize: 12, fontWeight: "800" },
  catalogBranches: { gap: 7 },
  branchHeader: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#eef1ec",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grow: { flex: 1 },
  section: { gap: 10, marginTop: 14 },
  accordion: {
    borderWidth: 1,
    borderColor: "#d8dbd5",
    borderRadius: 16,
    backgroundColor: "#fffefa",
    overflow: "hidden",
  },
  accordionHeader: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  accordionSummary: { color: "#17241d", fontSize: 14, fontWeight: "700" },
  accordionChevron: { color: "#1e6248", fontSize: 24, fontWeight: "700" },
  accordionBody: { padding: 16, paddingTop: 4, gap: 10 },
  question: { gap: 8, marginBottom: 10 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#cfd4ce",
    backgroundColor: "#fffefa",
    marginRight: 5,
  },
  chipActive: { backgroundColor: "#1e6248", borderColor: "#1e6248" },
  chipText: { fontSize: 12, color: "#536159", fontWeight: "700" },
  chipTextActive: { color: "white" },
  button: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: "#1e6248",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  buttonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#1e6248",
  },
  buttonDanger: { backgroundColor: "#8a4b40" },
  buttonLight: { backgroundColor: "#e5f0e8" },
  buttonOutlineLight: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#e5f0e8",
  },
  buttonSmall: {
    minHeight: 38,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  buttonText: { color: "white", fontWeight: "800", fontSize: 13 },
  buttonTextDark: { color: "#123c2d" },
  disabled: { opacity: 0.45 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffefa",
    padding: 15,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#dedfd7",
  },
  strong: { color: "#17241d", fontWeight: "800", fontSize: 13, lineHeight: 19 },
  meta: { color: "#77827b", fontSize: 11, lineHeight: 17 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusPill: {
    color: "#123c2d",
    backgroundColor: "#e5f0e8",
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: "800",
  },
  chatBubble: { borderRadius: 14, padding: 13, gap: 5, maxWidth: "92%" },
  chatBubbleClient: { backgroundColor: "#e5f0e8", alignSelf: "flex-end" },
  chatBubbleLex: { backgroundColor: "#fff5dc", alignSelf: "flex-start" },
  chatActor: { color: "#a66a25", fontSize: 10, fontWeight: "800" },
  longInput: { minHeight: 100, textAlignVertical: "top" },
  legalText: { color: "#34453c", fontSize: 13, lineHeight: 21 },
  arrow: { color: "#89938c", fontSize: 28 },
  danger: {
    color: "#8a4b40",
    textAlign: "center",
    fontWeight: "700",
    padding: 20,
  },
  top: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#e1e2dc",
  },
  back: { fontSize: 36, color: "#1e6248", width: 32 },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 13,
    color: "#17241d",
  },
  toggle: {
    minHeight: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fffefa",
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#dedfd7",
  },
});
