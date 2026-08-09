import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AttachmentStatus, HumanReviewStatus, MatterState, MessageChannel, prisma } from "@lex/database";
import { Queue, Worker } from "bullmq";

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return { host: url.hostname, port: Number(url.port || 6379), ...(url.password ? { password: decodeURIComponent(url.password) } : {}) };
}

const connection = redisConnection();
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "lex-local", secretAccessKey: process.env.S3_SECRET_KEY ?? "lex-local-secret" },
});

async function bufferBody(body: { transformToByteArray(): Promise<Uint8Array> } | undefined) {
  if (!body) throw new Error("Object body missing");
  return Buffer.from(await body.transformToByteArray());
}

function hasExpectedMagic(contentType: string, bytes: Buffer) {
  if (contentType === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (contentType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType.includes("ogg")) return bytes.subarray(0, 4).toString() === "OggS";
  return contentType.startsWith("audio/");
}

const evidenceWorker = new Worker("lex-evidence", async (job) => {
  const evidence = await prisma.evidenceItem.findUnique({ where: { id: String(job.data.evidenceId) } });
  if (!evidence || evidence.status === AttachmentStatus.AVAILABLE) return;
  const object = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET ?? "lex-private", Key: evidence.objectKey }));
  const bytes = await bufferBody(object.Body);
  const eicar = bytes.toString("utf8").includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE");
  if (bytes.length !== evidence.sizeBytes || eicar || !hasExpectedMagic(evidence.contentType, bytes)) {
    await prisma.evidenceItem.update({ where: { id: evidence.id }, data: { status: AttachmentStatus.REJECTED, rejectionReason: eicar ? "malware_signature_detected" : "file_signature_or_size_mismatch" } });
    return;
  }
  await prisma.evidenceItem.update({ where: { id: evidence.id }, data: { status: AttachmentStatus.AVAILABLE } });
}, { connection, concurrency: 3 });

const slaWorker = new Worker("lex-sla", async () => {
  const now = new Date();
  const warning = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const matters = await prisma.matter.findMany({ where: { state: { in: [MatterState.ACTIVE, MatterState.AWAITING_CLIENT, MatterState.LAWYER_REVIEW] }, dueAt: { lte: warning } } });
  for (const matter of matters) {
    const reason = matter.dueAt && matter.dueAt <= now ? "sla_overdue" : "sla_due_within_six_hours";
    const existing = await prisma.humanReview.findFirst({ where: { matterId: matter.id, reason, status: HumanReviewStatus.OPEN } });
    if (!existing) await prisma.humanReview.create({ data: { matterId: matter.id, reason } });
    await prisma.notification.upsert({
      where: { idempotencyKey: `${reason}:${matter.id}:${matter.dueAt?.toISOString() ?? "none"}` },
      update: {},
      create: { userId: matter.clientUserId, matterId: matter.id, channel: MessageChannel.SYSTEM, templateKey: reason, templateVersion: "v1", payload: { matterReference: matter.reference }, idempotencyKey: `${reason}:${matter.id}:${matter.dueAt?.toISOString() ?? "none"}` },
    });
  }
}, { connection, concurrency: 1 });

const scheduler = new Queue("lex-sla", { connection });
await scheduler.upsertJobScheduler("sla-scan-every-five-minutes", { every: 5 * 60 * 1000 }, { name: "scan", data: {} });

async function shutdown() {
  await Promise.all([evidenceWorker.close(), slaWorker.close(), scheduler.close()]);
  await prisma.$disconnect();
}
process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));
console.log("Lex worker ready: evidence validation and SLA escalation enabled");
