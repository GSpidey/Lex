import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class CryptoService {
  private readonly encryptionKey: Buffer;
  private readonly hashKey: string;

  constructor(private readonly config: ConfigService) {
    const raw = this.config.getOrThrow<string>("FIELD_ENCRYPTION_KEY");
    this.encryptionKey = createHash("sha256").update(raw).digest();
    this.hashKey = this.config.getOrThrow<string>("JWT_REFRESH_SECRET");
  }

  hash(value: string): string { return createHmac("sha256", this.hashKey).update(value).digest("hex"); }

  hashSecret(secret: string): string {
    const salt = randomBytes(16);
    const derived = scryptSync(secret, salt, 32);
    return `${salt.toString("base64url")}.${derived.toString("base64url")}`;
  }

  verifySecret(secret: string, encoded: string): boolean {
    const [saltValue, hashValue] = encoded.split(".");
    if (!saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, "base64url");
    const actual = scryptSync(secret, Buffer.from(saltValue, "base64url"), expected.length);
    return timingSafeEqual(actual, expected);
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  decrypt(value: string): string {
    const [ivValue, tagValue, ciphertextValue] = value.split(".");
    if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Malformed encrypted value");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
  }

  generateTotpSecret(): string {
    return this.toBase32(randomBytes(20));
  }

  totpUri(secret: string, account: string): string {
    return `otpauth://totp/Lex:${encodeURIComponent(account)}?secret=${secret}&issuer=Lex&algorithm=SHA1&digits=6&period=30`;
  }

  verifyTotp(secret: string, code: string, now = Date.now()): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const counter = Math.floor(now / 30_000);
    return [-1, 0, 1].some((offset) => this.totpCode(secret, counter + offset) === code);
  }

  private totpCode(secret: string, counter: number): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac("sha1", this.fromBase32(secret)).update(counterBuffer).digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
    return String(binary % 1_000_000).padStart(6, "0");
  }

  private toBase32(input: Buffer): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const byte of input) bits += byte.toString(2).padStart(8, "0");
    let output = "";
    for (let index = 0; index < bits.length; index += 5) output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
    return output;
  }

  private fromBase32(input: string): Buffer {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const character of input.replace(/=+$/u, "").toUpperCase()) {
      const value = alphabet.indexOf(character);
      if (value < 0) throw new Error("Invalid base32 secret");
      bits += value.toString(2).padStart(5, "0");
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    return Buffer.from(bytes);
  }
}
