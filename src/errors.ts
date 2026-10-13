import {
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ZodError } from "zod";

export class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof ZodError
          ? 400
          : error?.code === "P2002"
            ? 409
            : error?.code === "P2025"
              ? 404
              : 500;
    if (status === 500) console.error("NexaLab internal server error");
    response.status(status).json({
      message:
        status === 500
          ? "Lỗi hệ thống"
          : error instanceof ZodError
            ? error.issues
                .map((issue) => issue.path.join(".") + ": " + issue.message)
                .join("; ")
            : error?.code === "P2002"
              ? "Dữ liệu đã tồn tại"
              : error?.code === "P2025"
                ? "Không tìm thấy dữ liệu"
                : error instanceof HttpException
                  ? error.message
                  : "Yêu cầu không hợp lệ",
    });
  }
}
