import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "./prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      service: "lex-api",
      database: "connected",
      environment: this.config.get<string>("NODE_ENV"),
      providers: {
        openai: Boolean(this.config.get<string>("OPENAI_API_KEY")),
        meta: Boolean(this.config.get<string>("META_ACCESS_TOKEN")),
        paystack: Boolean(this.config.get<string>("PAYSTACK_SECRET_KEY")),
        flutterwave: Boolean(this.config.get<string>("FLUTTERWAVE_SECRET_KEY")),
      },
    };
  }
}
