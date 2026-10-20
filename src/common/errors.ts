import {
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ZodError } from "zod";

/**
 * Stable machine-readable error codes (B0P-T1). Route-specific codes such as
 * `IDEMPOTENCY_KEY_REUSED` or `EVIDENCE_NOT_FOUND` take precedence; these are
 * the fallback for each status class.
 */
export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  STEP_LOCKED: "STEP_LOCKED",
  DEPENDENCY_FAILURE: "DEPENDENCY_FAILURE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
};

const fallbackCode: Record<number, string> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  422: ErrorCode.VALIDATION_FAILED,
  429: ErrorCode.RATE_LIMITED,
  503: ErrorCode.DEPENDENCY_FAILURE,
};

const fallbackMessage: Record<number, string> = {
  400: "Yêu cầu không hợp lệ",
  401: "Vui lòng đăng nhập lại",
  403: "Không có quyền thực hiện",
  404: "Không tìm thấy dữ liệu",
  409: "Dữ liệu đã tồn tại",
  429: "Thao tác quá nhanh, thử lại sau",
  503: "Dịch vụ tạm thời không khả dụng, thử lại sau",
};

const codePattern = /^[A-Z][A-Z0-9_]{2,63}$/;

/** Prisma errors that mean the database could not be reached or timed out. */
function isDependencyFailure(error: any) {
  const name = error?.constructor?.name ?? error?.name;
  return (
    name === "PrismaClientInitializationError" ||
    name === "PrismaClientRustPanicError" ||
    ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error?.code)
  );
}

export function toErrorBody(error: any): ApiErrorBody {
  if (error instanceof ZodError)
    return {
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: error.issues
        .map((issue) => issue.path.join(".") + ": " + issue.message)
        .join("; "),
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  if (error instanceof HttpException) {
    const statusCode = error.getStatus();
    const response = error.getResponse() as any;
    const declared = typeof response === "object" && response ? response : {};
    const rawMessage =
      typeof response === "string" ? response : declared.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join("; ")
      : typeof rawMessage === "string" && rawMessage
        ? rawMessage
        : (fallbackMessage[statusCode] ?? "Yêu cầu không hợp lệ");
    const code =
      typeof declared.code === "string" && codePattern.test(declared.code)
        ? declared.code
        : (fallbackCode[statusCode] ??
          (statusCode >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED));
    if (statusCode >= 500 && statusCode !== 503)
      return { statusCode, code: ErrorCode.INTERNAL_ERROR, message: "Lỗi hệ thống" };
    return {
      statusCode,
      code,
      message,
      ...(declared.details !== undefined ? { details: declared.details } : {}),
    };
  }
  if (error?.code === "P2002")
    return { statusCode: 409, code: ErrorCode.CONFLICT, message: "Dữ liệu đã tồn tại" };
  if (error?.code === "P2025")
    return { statusCode: 404, code: ErrorCode.NOT_FOUND, message: "Không tìm thấy dữ liệu" };
  if (isDependencyFailure(error))
    return {
      statusCode: 503,
      code: ErrorCode.DEPENDENCY_FAILURE,
      message: fallbackMessage[503],
    };
  return { statusCode: 500, code: ErrorCode.INTERNAL_ERROR, message: "Lỗi hệ thống" };
}

export class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const body = toErrorBody(error);
    // Class name and Prisma code only: enough to diagnose, never the message (it can carry user data).
    if (body.statusCode === 500)
      console.error("NexaLab internal server error", error?.constructor?.name ?? "unknown", error?.code ?? "");
    if (body.statusCode === 503)
      console.error("NexaLab dependency failure", error?.constructor?.name ?? "unknown", error?.code ?? "");
    response.status(body.statusCode).json(body);
  }
}
