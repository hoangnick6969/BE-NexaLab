import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Avatar rules (D-ACC-03): small private images under a per-user prefix. */
export const AVATAR_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const avatarUploadSchema = z
  .object({
    contentType: z.enum(Object.keys(AVATAR_TYPES) as [keyof typeof AVATAR_TYPES, ...Array<keyof typeof AVATAR_TYPES>]),
    bytes: z.number().int().min(1).max(AVATAR_MAX_BYTES),
  })
  .strict();
export const avatarConfirmSchema = z.object({ key: z.string().min(1).max(300) }).strict();
export const profileUpdateSchema = z.object({ fullName: z.string().trim().min(1).max(120) }).strict();

/**
 * Key layout (docs/operations/r2-storage.md): uploads land under `<env>/staging/avatars/<user>/` and are
 * copied to `<env>/avatars/<user>/` on confirmation, so an upload that is never confirmed stays in the
 * staging prefix, which the bucket lifecycle rule expires.
 */
export const avatarStagingPrefix = (env: string, userId: string) => `${env}/staging/avatars/${userId}/`;
export const avatarPrefix = (env: string, userId: string) => `${env}/avatars/${userId}/`;
export const newAvatarKey = (env: string, userId: string, contentType: keyof typeof AVATAR_TYPES) =>
  `${avatarStagingPrefix(env, userId)}${randomUUID()}.${AVATAR_TYPES[contentType]}`;
/** Final key for a confirmed upload: same file name, moved out of staging. */
export const releasedAvatarKey = (stagingKey: string, env: string, userId: string) =>
  avatarPrefix(env, userId) + stagingKey.slice(avatarStagingPrefix(env, userId).length);

/** A confirmed key must be one this user was issued: their own staging prefix, one segment, a known extension. */
export function assertOwnAvatarKey(key: string, env: string, userId: string) {
  const prefix = avatarStagingPrefix(env, userId);
  const name = key.startsWith(prefix) ? key.slice(prefix.length) : "";
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name))
    throw new BadRequestException({ code: "AVATAR_KEY_INVALID", message: "Tệp ảnh không hợp lệ" });
}

/** The uploaded object must exist, fit the size limit and carry an allowed image type. */
export function assertAvatarObject(head: { bytes: number; contentType: string | null } | null) {
  if (!head) throw new BadRequestException({ code: "AVATAR_NOT_UPLOADED", message: "Chưa tải ảnh lên xong" });
  if (head.bytes < 1 || head.bytes > AVATAR_MAX_BYTES)
    throw new BadRequestException({ code: "AVATAR_TOO_LARGE", message: "Ảnh đại diện tối đa 2 MB" });
  if (head.contentType && !(head.contentType in AVATAR_TYPES))
    throw new BadRequestException({ code: "AVATAR_TYPE_INVALID", message: "Chỉ nhận ảnh PNG, JPEG hoặc WebP" });
}
