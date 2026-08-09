import * as SecureStore from "expo-secure-store";

export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? "local";
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
if (APP_ENV !== "local" && !configuredApiUrl)
  throw new Error("EXPO_PUBLIC_API_URL is required outside local development");
export const API_URL = configuredApiUrl ?? "http://10.0.2.2:8787/v1";
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string };
}
const KEY = "lex.session.v1";
export async function loadSession() {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}
export async function saveSession(value: Session) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(value), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
export async function clearSession() {
  await SecureStore.deleteItemAsync(KEY);
}
export async function saveDraft(
  intakeId: string,
  value: { narrative: string; outcome: string },
) {
  await SecureStore.setItemAsync(
    `lex.draft.${intakeId}`,
    JSON.stringify(value),
  );
}
export async function loadDraft(intakeId: string) {
  const raw = await SecureStore.getItemAsync(`lex.draft.${intakeId}`);
  return raw
    ? (JSON.parse(raw) as { narrative: string; outcome: string })
    : null;
}
export async function clearDraft(intakeId: string) {
  await SecureStore.deleteItemAsync(`lex.draft.${intakeId}`);
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const result = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(", ")
        : (result.message ?? `Request failed (${response.status})`),
    );
  return result as T;
}
