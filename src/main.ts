import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import express from "express";
import { AppModule } from "./app.module";
import { Errors } from "./common/errors";
import { quizOpenApiSchemas } from "./modules/learning/interface/quiz-contract";
import { labHintOpenApiSchemas } from "./modules/labs/interface/hint-contract";
async function bootstrap() {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.startsWith("replace-")
  )
    throw new Error("Cần JWT_SECRET ngẫu nhiên ít nhất 32 ký tự");
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Structured class-resource CSV is transported as JSON and capped by its route contract at 1 MB.
  app.use(express.json({ limit: "3mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use(helmet());
  app.use(cookieParser());
  const configuredOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowLocalDevOrigin = process.env.NODE_ENV !== "production" && process.env.APP_ENV !== "production";
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || configuredOrigins.includes(origin)) return callback(null, true);
      if (allowLocalDevOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
        return callback(null, true);
      return callback(new Error("Origin not allowed by CORS"), false);
    },
    credentials: true,
    // Multipart uploads read each part's ETag (local storage driver; R2 exposes it through bucket CORS).
    exposedHeaders: ["ETag"],
  });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  // Swagger lists every route: off in production unless SWAGGER_ENABLED=true (security review 2026-11-16, item 5).
  const production = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  if (!production || process.env.SWAGGER_ENABLED === "true") {
  const spec = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("NexaLab API")
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  spec.components ??= {};
  spec.components.schemas = {
    ...spec.components.schemas,
    ...quizOpenApiSchemas,
    ...labHintOpenApiSchemas,
  };
  SwaggerModule.setup("api/docs", app, spec);
  }
  await app.listen(
    Number(process.env.PORT ?? 4100),
    process.env.HOST ?? "127.0.0.1",
  );
}
bootstrap();
