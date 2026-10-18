import { ConflictException, HttpException, NotFoundException } from "@nestjs/common";
import { z } from "zod";

export const text = z.string().trim().min(1).max(200);

export const grade = z.number().int().min(6).max(9);

export const reason = z.string().trim().max(500).optional();

export const MSG = {
  classArchived: "Lớp đã lưu trữ; không thể thay đổi, thêm thành viên hay giao bài",
  joinInvalid: "Mã lớp không hợp lệ.",
  joinLocked: "Đã thử quá nhiều lần. Hãy thử lại sau 15 phút.",
  joinPending: "Yêu cầu vào lớp đang chờ giáo viên duyệt.",
  joinApproved: "Đã vào lớp.",
  publishFirst: "Hãy xuất bản nội dung trước khi giao.",
  dueInPast: "Hạn nộp không được ở trong quá khứ.",
  confirmRequired: "Cần xác nhận trước khi thực hiện thao tác này",
};

export const classArchived = () => new ConflictException({ code: "CLASS_ARCHIVED", message: MSG.classArchived });

export const joinInvalid = () =>
  new NotFoundException({
    code: "JOIN_CODE_INVALID",
    message: MSG.joinInvalid,
  });

export const joinLocked = () => new HttpException({ code: "JOIN_RATE_LIMITED", message: MSG.joinLocked }, 429);

/** Serializes per-teacher name checks and per-class assignment checks. */
export async function lock(tx: any, scope: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope}))`;
}
