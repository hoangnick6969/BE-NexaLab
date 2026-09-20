import "reflect-metadata";
import "dotenv/config";
import {
  Module,
  ValidationPipe,
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ZodError } from "zod";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { Db } from "./db";
import { AuthGuard } from "./auth";
import { ApiController } from "./routes";
import { FilesController } from "./files";
@Catch()
class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof ZodError
          ? 400
          : error.code === "P2002"
            ? 409
            : error.code === "P2025"
              ? 404
              : 500;
    if (status === 500) console.error(error);
    res
      .status(status)
      .json({
        message:
          status === 500
            ? "Lỗi hệ thống"
            : error instanceof ZodError
              ? error.issues
                  .map((i) => i.path.join(".") + ": " + i.message)
                  .join("; ")
              : error.code === "P2002"
                ? "Dữ liệu đã tồn tại"
                : error.code === "P2025"
                  ? "Không tìm thấy dữ liệu"
                  : error.message,
      });
  }
}
@Module({
  controllers: [ApiController, FilesController],
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
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
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
  SwaggerModule.setup("api/docs", app, spec);
  await app.listen(
    Number(process.env.PORT ?? 4000),
    process.env.HOST ?? "127.0.0.1",
  );
}
bootstrap();
