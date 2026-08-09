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
import { NIGERIA_STATES } from "@lex/jurisdictions";
import { useEffect, useMemo, useState } from "react";
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
  api,
  clearSession,
  loadSession,
  saveSession,
  type Session,
} from "@/lib/api";

type Language = "en" | "pcm";
type Role = "tenant" | "landlord";
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
  version: number;
};
type Matter = {
  id: string;
  reference: string;
  state: string;
  urgency: string;
  state_code: string;
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
};
type Transcription = {
  id: string;
  status: string;
  transcript?: string;
  confirmed_transcript?: string;
  version: number;
};
type Preferences = { whatsapp: boolean; push: boolean; email: boolean };
type CountryCode = {
  country: string;
  iso: string;
  dialCode: string;
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
    headline: "Your tenancy issue, clearly understood.",
    start: "Start an assessment",
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
    headline: "Make we understand your tenancy matter well.",
    start: "Start matter check",
    tenant: "Tenant",
    landlord: "Landlord",
    continue: "Continue with WhatsApp",
    code: "Verification code",
    verify: "Verify and continue",
    confirm: "I confirm say this correct",
    submit: "Send am for lawyer matching",
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
    "home" | "intake" | "matter" | "settings" | "privacy"
  >("home");
  const [language, setLanguage] = useState<Language>("en");
  const [role, setRole] = useState<Role>("tenant");
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
      const created = await api<Intake>(
        "/intakes",
        {
          method: "POST",
          body: JSON.stringify({
            language,
            tenancyRole: role,
            countryCode: "NG",
            stateCode,
            sourceChannel: "mobile",
          }),
        },
        session.accessToken,
      );
      setIntake(created);
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
                "The client completed the guided tenancy intake.",
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
      setMatter(
        await api<MatterDetail>(`/matters/${item.id}`, {}, session.accessToken),
      );
      setScreen("matter");
    });
  }
  async function sendMessage() {
    if (!session || !matter || !messageBody.trim()) return;
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
  return (
    <Home
      language={language}
      setLanguage={setLanguage}
      role={role}
      setRole={setRole}
      stateCode={stateCode}
      setStateCode={setStateCode}
      matters={matters}
      notice={notice}
      busy={busy}
      startIntake={startIntake}
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
            Lex organizes your facts and routes eligible Lagos matters to
            verified lawyers. It is not an emergency service or automated legal
            adviser.
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
  role: Role;
  setRole: (value: Role) => void;
  stateCode: string;
  setStateCode: (value: string) => void;
  matters: Matter[];
  notice: string;
  busy: boolean;
  startIntake: () => void;
  openMatter: (matter: Matter) => void;
  openSettings: () => void;
  signOut: () => void;
}) {
  const words = copy[props.language];
  return (
    <Shell>
      <View style={styles.between}>
        <View>
          <Text style={styles.kicker}>LEX CONTROLLED PILOT</Text>
          <Text style={styles.heading}>Good day.</Text>
        </View>
        <Button small label="Settings" onPress={props.openSettings} />
      </View>
      <Card dark>
        <Text style={styles.kickerLight}>TENANCY SUPPORT</Text>
        <Text style={styles.heroLight}>{words.headline}</Text>
        <Button
          light
          label={words.start}
          onPress={props.startIntake}
          busy={props.busy}
        />
      </Card>
      <Section label="Language">
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
        </View>
      </Section>
      <Section label="I am the">
        <View style={styles.row}>
          <Chip
            label={words.tenant}
            active={props.role === "tenant"}
            onPress={() => props.setRole("tenant")}
          />
          <Chip
            label={words.landlord}
            active={props.role === "landlord"}
            onPress={() => props.setRole("landlord")}
          />
        </View>
      </Section>
      <Section label="Property state">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {stateChoices.map((item) => (
            <Chip
              key={item.code}
              label={item.name}
              active={props.stateCode === item.code}
              onPress={() => props.setStateCode(item.code)}
            />
          ))}
        </ScrollView>
        {props.stateCode !== "LA" ? (
          <Notice text="This state is intake-only. Lawyer matching and payment remain unavailable." />
        ) : null}
      </Section>
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
}) {
  const assessment = props.matter.assessment;
  return (
    <Shell back={props.back} title={props.matter.reference}>
      <Card dark>
        <Text style={styles.kickerLight}>{title(props.matter.state)}</Text>
        <Text style={styles.heroLight}>Tenancy assessment</Text>
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
      {["active", "awaiting_client", "lawyer_review", "delivered"].includes(
        props.matter.state,
      ) ? (
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
  small,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  light?: boolean;
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
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grow: { flex: 1 },
  section: { gap: 10, marginTop: 14 },
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
