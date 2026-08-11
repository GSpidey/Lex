const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
async function key(secret: string) {
  const bytes = fromBase64(secret);
  if (bytes.byteLength !== 32) throw new Error("Invalid field encryption key");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}
function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(secret),
      encoder.encode(value),
    ),
  );
  return `${toBase64(iv)}.${toBase64(body)}`;
}
export async function decrypt(value: string, secret: string) {
  const [iv, body] = value.split(".");
  if (!iv || !body) throw new Error("Malformed encrypted value");
  return decoder.decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      await key(secret),
      fromBase64(body),
    ),
  );
}
export async function hmac(value: string, secret: string) {
  const keyValue = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", keyValue, encoder.encode(value)),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
