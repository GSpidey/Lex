import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnvironment } from "./config.js";
import { PrismaService } from "./prisma.service.js";
import { CryptoService } from "./crypto.service.js";
import { AuditService } from "./audit.service.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { OpenAIProviderService } from "./openai.provider.js";
import { S3ObjectStorageProvider } from "./storage.provider.js";
import { MetaWhatsAppProvider } from "./meta.provider.js";
import { PaystackProvider, FlutterwaveProvider, PaymentProviderRegistry } from "./payment.providers.js";
import { MatchingService } from "./matching.service.js";
import { IntakeService } from "./intake.service.js";
import { IntakeController } from "./intake.controller.js";
import { MatterService } from "./matter.service.js";
import { MatterController } from "./matter.controller.js";
import { LawyerService } from "./lawyer.service.js";
import { LawyerController } from "./lawyer.controller.js";
import { PaymentService } from "./payment.service.js";
import { PaymentController } from "./payment.controller.js";
import { AdminService } from "./admin.service.js";
import { AdminController } from "./admin.controller.js";
import { WebhookController } from "./webhook.controller.js";
import { HealthController } from "./health.controller.js";
import { QueueService } from "./queue.service.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"], validate: validateEnvironment }),
    JwtModule.registerAsync({ global: true, inject: [ConfigService], useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>("JWT_ACCESS_SECRET") }) }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController, IntakeController, MatterController, LawyerController, PaymentController, AdminController, WebhookController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, PrismaService, CryptoService, AuditService, AuthGuard, AuthService, OpenAIProviderService, S3ObjectStorageProvider, MetaWhatsAppProvider, PaystackProvider, FlutterwaveProvider, PaymentProviderRegistry, QueueService, MatchingService, IntakeService, MatterService, LawyerService, PaymentService, AdminService],
})
export class AppModule {}
