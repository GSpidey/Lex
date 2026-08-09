import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<string, Queue>();
  private readonly connection: { host: string; port: number; password?: string };

  constructor(config: ConfigService) {
    const url = new URL(config.getOrThrow<string>("REDIS_URL"));
    this.connection = { host: url.hostname, port: Number(url.port || 6379), ...(url.password ? { password: decodeURIComponent(url.password) } : {}) };
  }

  async add(queueName: string, name: string, data: Record<string, unknown>, jobId: string) {
    let queue = this.queues.get(queueName);
    if (!queue) { queue = new Queue(queueName, { connection: this.connection }); this.queues.set(queueName, queue); }
    await queue.add(name, data, { jobId: jobId.replaceAll(":", "-"), attempts: 5, backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: 500, removeOnFail: 1_000 });
  }

  async onModuleDestroy() { await Promise.all([...this.queues.values()].map((queue) => queue.close())); }
}
