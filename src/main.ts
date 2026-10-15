import "reflect-metadata";
import "dotenv/config";
import { Module } from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { Db } from "./db";
import { AuthGuard } from "./auth";
import { ApiController } from "./routes";
import { FilesController } from "./files";
import { ClassesController } from "./classes";
import { B2Controller } from "./b2";
import { AdminController } from "./admin";
import { AssetsController, LocalStorageController } from "./assets";
import { Errors } from "./errors";
import { quizOpenApiSchemas } from "./quiz-contract";
@Module({
  controllers: [ApiController, ClassesController, B2Controller, AdminController, AssetsController, LocalStorageController, FilesController],
  providers: [Db, { provide: APP_GUARD, useClass: AuthGuard }],
})
class AppModule {}
async function bootstrap() {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.startsWith("replace-")
  )
    throw new Error("Cần JWT_SECRET ngẫu nhiên ít nhất 32 ký tự");
  const app = await NestFactory.create(AppModule);
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
  };
  SwaggerModule.setup("api/docs", app, spec);
  await app.listen(
    Number(process.env.PORT ?? 4000),
    process.env.HOST ?? "127.0.0.1",
  );
}
bootstrap();
