import { z } from "zod";

export const text = z.string().trim().min(1).max(200);
export const password = z.string().min(12).max(128);
export const email = z
  .string()
  .email()
  .transform((v) => v.toLowerCase());
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Username chỉ gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới");
