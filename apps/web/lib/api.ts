export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787/v1";

export interface SessionUser {
  id: string;
  role: "client" | "lawyer" | "admin" | "super_admin";
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem("lex.session");
  try {
    return value ? (JSON.parse(value) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(session: Session) {
  window.localStorage.setItem("lex.session", JSON.stringify(session));
}
export function clearSession() {
  window.localStorage.removeItem("lex.session");
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
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(body.message)
        ? body.message.join(", ")
        : (body.message ?? `Request failed (${response.status})`),
    );
  return body as T;
}
