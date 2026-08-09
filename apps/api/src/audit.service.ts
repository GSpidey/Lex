import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: { actorUserId?: string; matterId?: string; action: string; entityType: string; entityId: string; result?: string; metadata?: Record<string, unknown>; ipHash?: string }) {
    const previous = await this.prisma.auditEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { eventHash: true } });
    const createdAt = new Date();
    const canonical = JSON.stringify({ previous: previous?.eventHash ?? null, ...input, createdAt: createdAt.toISOString() });
    const eventHash = createHash("sha256").update(canonical).digest("hex");
    return this.prisma.auditEvent.create({ data: {
      actorUserId: input.actorUserId,
      matterId: input.matterId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      result: input.result ?? "success",
      metadata: (input.metadata ?? {}) as object,
      previousHash: previous?.eventHash,
      eventHash,
      ipHash: input.ipHash,
      createdAt,
    } });
  }
}
