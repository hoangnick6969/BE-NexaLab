import { BadRequestException, NotFoundException } from "@nestjs/common";
import { z } from "zod";

// Conventions shared by every /admin controller: input fields, keyset pagination and the not-found error.

export const text = z.string().trim().min(1).max(200);

export const reason = z.string().trim().min(3, "Cần nêu lý do (ít nhất 3 ký tự)").max(500);

export const code = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Mã chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới");

export const limit = z.coerce.number().int().min(1).max(100).default(25);

/** Opaque keyset cursor over (createdAt desc, id desc). */
export const encodeCursor = (row: { createdAt: Date; id: string }) =>
  Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");

export function cursorWhere(cursor?: string) {
  if (!cursor) return {};
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const createdAt = new Date(at);
  if (!id || Number.isNaN(createdAt.getTime()))
    throw new BadRequestException({ code: "INVALID_CURSOR", message: "Con trỏ phân trang không hợp lệ" });
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

export function page<T extends { createdAt: Date; id: string }>(rows: T[], take: number) {
  const items = rows.slice(0, take);
  return { items, nextCursor: rows.length > take ? encodeCursor(items[items.length - 1]) : null };
}

export const notFound = (what: string) => new NotFoundException({ code: "NOT_FOUND", message: `Không tìm thấy ${what}` });
