import { BadRequestException } from "@nestjs/common";
import * as argon from "argon2";
import { hashToken, token } from "./auth";
import type { Deliver } from "./mail";

/** C2-T4 / D12: adult password reset by a one-time link. */
export const RESET_TTL_MS = 60 * 60 * 1000;
export const FORGOT_MESSAGE = "Nếu email tồn tại, hướng dẫn đã được gửi.";
const invalidToken = () =>
  new BadRequestException({ code: "RESET_TOKEN_INVALID", message: "Liên kết đặt lại mật khẩu không hợp lệ, đã dùng hoặc đã hết hạn" });

type Adult = { id: string; email: string | null; role: string; status: string };
const eligible = (user: Adult | null | undefined): user is Adult & { email: string } =>
  Boolean(user && user.email && user.role !== "STUDENT" && user.status === "active");

export function resetUrl(
  rawToken: string,
  origin = process.env.APP_ORIGIN ?? process.env.WEB_ORIGIN?.split(",")[0] ?? "http://127.0.0.1:5173",
) {
  return `${origin.replace(/\/$/, "")}/?reset=${encodeURIComponent(rawToken)}`;
}

/**
 * Stores only the token hash (one live link per account, 60 minutes) and
 * delivers the link. A delivery failure removes the token, so nothing reusable
 * is left behind; the caller never learns more than "sent or not".
 */
export async function issueResetLink(db: any, user: Adult, deliver: Deliver) {
  if (!eligible(user)) return false;
  const raw = token();
  const tokenHash = hashToken(raw);
  await db.$transaction(async (tx: any) => {
    await tx.session.deleteMany({ where: { userId: user.id, kind: "reset" } });
    await tx.session.create({ data: { userId: user.id, kind: "reset", tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
  });
  try {
    await deliver({
      to: user.email,
      subject: "Đặt lại mật khẩu NexaLab",
      text: `Mở liên kết sau để đặt lại mật khẩu. Liên kết chỉ dùng được một lần và hết hạn sau 60 phút:\n${resetUrl(raw)}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    });
    return true;
  } catch {
    await db.session.deleteMany({ where: { tokenHash } });
    console.error("NexaLab password-reset delivery failed");
    return false;
  }
}

/** Forgot-password: same outcome for unknown, student, disabled and active accounts. */
export async function requestPasswordReset(db: any, email: string, deliver: Deliver) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, status: true } });
  if (eligible(user)) await issueResetLink(db, user, deliver);
}

/**
 * Consumes the token exactly once (a concurrent second consume deletes
 * nothing and fails), sets the password and revokes every session.
 */
export async function completePasswordReset(db: any, rawToken: string, password: string) {
  const tokenHash = hashToken(rawToken);
  const passwordHash = await argon.hash(password);
  await db.$transaction(async (tx: any) => {
    const session = await tx.session.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, role: true, status: true } } },
    });
    if (!session || session.kind !== "reset") throw invalidToken();
    const used = await tx.session.deleteMany({ where: { id: session.id } });
    if (!used.count || session.expiresAt <= new Date() || !eligible(session.user)) throw invalidToken();
    await tx.user.update({
      where: { id: session.userId },
      data: { passwordHash, mustChangePassword: false, temporaryPasswordExpiresAt: null },
    });
    await tx.session.deleteMany({ where: { userId: session.userId } });
  });
}
