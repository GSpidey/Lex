const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function randomOtp(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return String(value % 1_000_000).padStart(6, "0");
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Secret(bytes = 20): string {
  const input = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = "";
  let output = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  for (let index = 0; index < bits.length; index += 5)
    output +=
      base32Alphabet[
        Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)
      ];
  return output;
}

function decodeBase32(value: string): Uint8Array {
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const output: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    output.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Uint8Array.from(output);
}

export async function verifyTotp(
  secret: string,
  code: string,
  currentTime = Date.now(),
): Promise<boolean> {
  if (!/^\d{6}$/u.test(code)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(decodeBase32(secret)).buffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  for (let offset = -1; offset <= 1; offset += 1) {
    let counter = BigInt(Math.floor(currentTime / 30_000) + offset);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(4, Number(counter & 0xffffffffn));
    counter >>= 32n;
    view.setUint32(0, Number(counter & 0xffffffffn));
    const digest = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, buffer),
    );
    const position = (digest[digest.length - 1] ?? 0) & 0x0f;
    const value =
      (((digest[position] ?? 0) & 0x7f) << 24) |
      ((digest[position + 1] ?? 0) << 16) |
      ((digest[position + 2] ?? 0) << 8) |
      (digest[position + 3] ?? 0);
    if (constantTimeEqual(String(value % 1_000_000).padStart(6, "0"), code))
      return true;
  }
  return false;
}

export async function sha256(value: string | ArrayBuffer): Promise<string> {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  return bytesToBase64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", input)),
  );
}

export async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    ),
  );
}

export async function hmacBytes(
  value: ArrayBuffer,
  secret: string,
  hash: "SHA-256" | "SHA-512",
  format: "base64" | "hex" = "base64",
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, value));
  if (format === "base64") return bytesToBase64(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1)
    mismatch |= (a[index % a.length] ?? 0) ^ (b[index % b.length] ?? 0);
  return mismatch === 0;
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(secret);
  if (bytes.byteLength !== 32)
    throw new Error(
      "FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(bytes).buffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(value),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

export async function decrypt(value: string, secret: string): Promise<string> {
  const [ivValue, cipherValue] = value.split(".");
  if (!ivValue || !cipherValue) throw new Error("Encrypted value is malformed");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToBytes(ivValue)).buffer },
    await encryptionKey(secret),
    new Uint8Array(base64ToBytes(cipherValue)).buffer,
  );
  return decoder.decode(clear);
}
