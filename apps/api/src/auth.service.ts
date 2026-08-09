import { randomBytes, randomInt } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Language, UserRole, UserStatus } from "@lex/database";
import { refreshSessionSchema, requestOtpSchema, verifyOtpSchema, type RequestOtpInput, type VerifyOtpInput } from "@lex/contracts";
import nodemailer from "nodemailer";
import { PrismaService } from "./prisma.service.js";
import { CryptoService } from "./crypto.service.js";
import { AuditService } from "./audit.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async requestOtp(raw: unknown) {
    const input = requestOtpSchema.parse(raw);
    const destination = input.channel === "whatsapp" ? input.phone! : input.email!;
    const destinationHash = this.crypto.hash(destination);
    const recent = await this.prisma.authChallenge.count({ where: { destinationHash, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
    if (recent >= 5) throw new HttpException("Too many verification requests. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    const user = input.channel === "whatsapp"
      ? await this.prisma.user.findUnique({ where: { phone: destination } })
      : await this.prisma.user.findUnique({ where: { email: destination.toLowerCase() } });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const challenge = await this.prisma.authChallenge.create({ data: {
      userId: user?.id,
      channel: input.channel,
      destinationHash,
      destinationEncrypted: this.crypto.encrypt(destination),
      codeHash: this.crypto.hashSecret(code),
      purpose: input.purpose,
      expiresAt,
    } });
    await this.deliverOtp(input, destination, code);
    await this.audit.record({ actorUserId: user?.id, action: "auth.otp_requested", entityType: "AuthChallenge", entityId: challenge.id, metadata: { channel: input.channel, purpose: input.purpose } });
    return {
      challengeId: challenge.id,
      expiresAt,
      delivery: input.channel,
      ...(this.config.get<boolean>("DEV_OTP_ECHO") ? { devCode: code } : {}),
    };
  }

  async verifyOtp(raw: unknown) {
    const input = verifyOtpSchema.parse(raw);
    const challenge = await this.prisma.authChallenge.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) throw new UnauthorizedException("Verification challenge expired");
    if (challenge.attempts >= challenge.maxAttempts) throw new UnauthorizedException("Verification challenge locked");
    if (!this.crypto.verifySecret(input.code, challenge.codeHash)) {
      await this.prisma.authChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException("Verification code is incorrect");
    }
    const destination = this.crypto.decrypt(challenge.destinationEncrypted);
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      const existing = challenge.userId ? await tx.user.findUnique({ where: { id: challenge.userId } }) : null;
      if (existing) return tx.user.update({ where: { id: existing.id }, data: challenge.channel === "whatsapp" ? { phoneVerifiedAt: existing.phoneVerifiedAt ?? new Date() } : { emailVerifiedAt: existing.emailVerifiedAt ?? new Date() } });
      return tx.user.create({ data: {
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        ...(challenge.channel === "whatsapp" ? { phone: destination, phoneVerifiedAt: new Date() } : { email: destination.toLowerCase(), emailVerifiedAt: new Date() }),
        preferredLanguage: Language.EN,
        clientProfile: { create: challenge.channel === "whatsapp" ? { whatsappOptInAt: new Date(), whatsappUserId: destination } : {} },
      } });
    });
    await this.audit.record({ actorUserId: user.id, action: "auth.otp_verified", entityType: "User", entityId: user.id, metadata: { channel: challenge.channel } });
    const mfaRoles: UserRole[] = [UserRole.LAWYER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (mfaRoles.includes(user.role) && !user.mfaEnabled) {
      return { mfaSetupRequired: true, preAuthToken: await this.signPreAuth(user.id, user.role, "mfa_setup") };
    }
    if (mfaRoles.includes(user.role) && user.mfaEnabled) {
      return { mfaRequired: true, preAuthToken: await this.signPreAuth(user.id, user.role, "mfa_verify") };
    }
    return this.createSession(user.id, user.role, input.deviceName);
  }

  async setupMfa(preAuthToken: string) {
    const payload = await this.verifyPreAuth(preAuthToken, "mfa_setup");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    const secret = this.crypto.generateTotpSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaSecretEncrypted: this.crypto.encrypt(secret), mfaEnabled: false } });
    return { secret, uri: this.crypto.totpUri(secret, user.email ?? user.phone ?? user.id) };
  }

  async verifyMfa(preAuthToken: string, code: string, deviceName?: string) {
    const payload = await this.verifyPreAuth(preAuthToken);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    if (!user.mfaSecretEncrypted) throw new BadRequestException("MFA setup has not started");
    const secret = this.crypto.decrypt(user.mfaSecretEncrypted);
    if (!this.crypto.verifyTotp(secret, code)) throw new UnauthorizedException("MFA code is incorrect");
    if (!user.mfaEnabled) await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await this.audit.record({ actorUserId: user.id, action: "auth.mfa_verified", entityType: "User", entityId: user.id });
    return this.createSession(user.id, user.role, deviceName);
  }

  async refresh(raw: unknown) {
    const { refreshToken } = refreshSessionSchema.parse(raw);
    const tokenHash = this.crypto.hash(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: tokenHash }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== UserStatus.ACTIVE) throw new UnauthorizedException("Refresh session is invalid");
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), rotatedAt: new Date() } });
    return this.createSession(session.userId, session.user.role, session.deviceName);
  }

  async requestLinkedEmail(userId: string, rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/u.test(email)) throw new BadRequestException("A valid email address is required");
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId) throw new BadRequestException("That email is already linked to another account");
    const destinationHash = this.crypto.hash(email);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge = await this.prisma.authChallenge.create({ data: { userId, channel: "email", destinationHash, destinationEncrypted: this.crypto.encrypt(email), codeHash: this.crypto.hashSecret(code), purpose: "verify_email", expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    await this.deliverOtp({ channel: "email", email, purpose: "verify_email", locale: "en" }, email, code);
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt, ...(this.config.get<boolean>("DEV_OTP_ECHO") ? { devCode: code } : {}) };
  }

  async verifyLinkedEmail(userId: string, challengeId: string, code: string) {
    const challenge = await this.prisma.authChallenge.findFirst({ where: { id: challengeId, userId, purpose: "verify_email" } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date() || challenge.attempts >= challenge.maxAttempts) throw new UnauthorizedException("Email verification challenge expired");
    if (!this.crypto.verifySecret(code, challenge.codeHash)) { await this.prisma.authChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } }); throw new UnauthorizedException("Verification code is incorrect"); }
    const email = this.crypto.decrypt(challenge.destinationEncrypted).toLowerCase();
    await this.prisma.$transaction([this.prisma.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } }), this.prisma.user.update({ where: { id: userId }, data: { email, emailVerifiedAt: new Date() } })]);
    await this.audit.record({ actorUserId: userId, action: "auth.email_verified", entityType: "User", entityId: userId });
    return { verified: true, email };
  }

  async logout(sessionId: string, userId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorUserId: userId, action: "auth.logout", entityType: "Session", entityId: sessionId });
    return { success: true };
  }

  private async createSession(userId: string, role: UserRole, deviceName?: string | null) {
    const refreshToken = randomBytes(48).toString("base64url");
    const session = await this.prisma.session.create({ data: {
      userId,
      refreshTokenHash: this.crypto.hash(refreshToken),
      deviceName: deviceName ?? null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } });
    const accessToken = await this.jwt.signAsync({ sub: userId, role, sid: session.id, scope: "access" }, { expiresIn: "15m" });
    return { accessToken, refreshToken, expiresInSeconds: 900, user: { id: userId, role } };
  }

  private signPreAuth(userId: string, role: UserRole, scope: "mfa_setup" | "mfa_verify") {
    return this.jwt.signAsync({ sub: userId, role, scope }, { expiresIn: "10m" });
  }

  private async verifyPreAuth(token: string, requiredScope?: "mfa_setup" | "mfa_verify") {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: UserRole; scope: string }>(token);
      if (requiredScope && payload.scope !== requiredScope) throw new Error("scope");
      if (!requiredScope && !["mfa_setup", "mfa_verify"].includes(payload.scope)) throw new Error("scope");
      return payload;
    } catch {
      throw new UnauthorizedException("MFA pre-authentication token is invalid");
    }
  }

  private async deliverOtp(input: RequestOtpInput, destination: string, code: string) {
    if (input.channel === "whatsapp" && this.config.get<string>("META_ACCESS_TOKEN") && this.config.get<string>("META_PHONE_NUMBER_ID")) {
      const version = this.config.get<string>("META_GRAPH_VERSION") ?? "v24.0";
      const response = await fetch(`https://graph.facebook.com/${version}/${this.config.get<string>("META_PHONE_NUMBER_ID")}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.get<string>("META_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: destination, type: "template", template: { name: "lex_authentication", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: code }] }] } }),
      });
      if (!response.ok) throw new BadRequestException("WhatsApp verification delivery failed");
      return;
    }
    if (input.channel === "email" && this.config.get<string>("SMTP_HOST")) {
      const transport = nodemailer.createTransport({ host: this.config.get<string>("SMTP_HOST"), port: this.config.get<number>("SMTP_PORT"), secure: false, auth: { user: this.config.get<string>("SMTP_USER"), pass: this.config.get<string>("SMTP_PASSWORD") } });
      await transport.sendMail({ from: this.config.get<string>("SMTP_FROM"), to: destination, subject: "Your Lex verification code", text: `Your Lex verification code is ${code}. It expires in five minutes.` });
      return;
    }
    if (!this.config.get<boolean>("DEV_OTP_ECHO")) throw new BadRequestException("Selected verification delivery provider is not configured");
  }
}
