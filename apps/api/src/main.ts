import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.enableCors({ origin: true, credentials: true, allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"] });
  app.setGlobalPrefix("v1", { exclude: ["health"] });
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("Lex API").setDescription("Nigeria-first legal-access platform API").setVersion("1.0").addBearerAuth().build());
  SwaggerModule.setup("docs", app, document);
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  Logger.log(`Lex API listening on ${port}`, "Bootstrap");
}

bootstrap().catch((error) => {
  Logger.error(error instanceof Error ? error.stack : error, "Bootstrap");
  process.exitCode = 1;
});
