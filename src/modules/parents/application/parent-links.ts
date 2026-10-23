import { BadRequestException } from "@nestjs/common";
import { hashToken, token } from "../../auth/interface/auth";
import type { Deliver } from "../../mail/infrastructure/mail";
import { PARENT_CONSENT_HASH, PARENT_CONSENT_VERSION } from "./parent-codes";

/** PRD §14 / C1 CAP-2: parent email verification proves mailbox control through a one-time mailed link. */
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const invalidToken = () =>
  new BadRequestException({ code: "EMAIL_VERIFY_TOKEN_INVALID", message: "Liên kết xác minh email không hợp lệ, đã dùng hoặc đã hết hạn" });

export function verifyEmailUrl(
  rawToken: string,
  origin = process.env.APP_ORIGIN ?? process.env.WEB_ORIGIN?.split(",")[0] ?? "http://127.0.0.1:5173",
) {
  return `${origin.replace(/\/$/, "")}/?verifyEmail=${encodeURIComponent(rawToken)}`;
}

/** The parent's current, non-withdrawn PARENT_CHILD_PROGRESS consent (the "dev" hash is accepted outside production). */
export const currentConsentWhere = (userId: string) => ({
  userId,
  purpose: "PARENT_CHILD_PROGRESS",
  version: PARENT_CONSENT_VERSION,
  ...(process.env.NODE_ENV !== "production" ? { contentHash: { in: [PARENT_CONSENT_HASH, "dev"] } } : { contentHash: PARENT_CONSENT_HASH }),
  withdrawnAt: null,
});

/** Whether the parent has both activation prerequisites: a verified email and current consent. */
export async function linkPrerequisites(db: any, parentId: string) {
  const [parent, consent] = await Promise.all([
    db.user.findUnique({ where: { id: parentId }, select: { emailVerifiedAt: true } }),
    db.parentConsent.findFirst({ where: currentConsentWhere(parentId), select: { id: true } }),
  ]);
  return { emailVerified: Boolean(parent?.emailVerifiedAt), consent: Boolean(consent) };
}

/**
 * C1 SPEC: completing either prerequisite later re-evaluates the parent's pending links; they are approved only
 * once both hold. Call inside the transaction that completed the prerequisite.
 */
export async function approvePendingLinks(tx: any, parentId: string) {
  const { emailVerified, consent } = await linkPrerequisites(tx, parentId);
  if (!emailVerified || !consent) return 0;
  const result = await tx.parentLink.updateMany({
    where: { parentId, status: "pending", revokedAt: null },
    data: { status: "approved", verifiedAt: new Date() },
  });
  return result.count;
}

type Parent = { id: string; email: string | null; role: string; status: string };

/** Stores only the token hash (one live link per account) and mails the link; a delivery failure removes the token. */
export async function issueEmailVerification(db: any, user: Parent, deliver: Deliver) {
  if (!user.email || user.role !== "PARENT" || user.status !== "active") return false;
  const raw = token();
  const tokenHash = hashToken(raw);
  await db.$transaction(async (tx: any) => {
    await tx.session.deleteMany({ where: { userId: user.id, kind: "email-verify" } });
    await tx.session.create({ data: { userId: user.id, kind: "email-verify", tokenHash, expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS) } });
  });
  try {
    await deliver({
      to: user.email,
      subject: "Xác minh email NexaLab",
      text: `Mở liên kết sau để xác minh email tài khoản phụ huynh NexaLab. Liên kết chỉ dùng được một lần và hết hạn sau 24 giờ:\n${verifyEmailUrl(raw)}\n\nNếu bạn không tạo tài khoản, hãy bỏ qua email này.`,
    });
    return true;
  } catch {
    await db.session.deleteMany({ where: { tokenHash } });
    console.error("NexaLab email-verification delivery failed");
    return false;
  }
}

/** Consumes the token exactly once, marks the email verified and re-evaluates pending links in the same transaction. */
export async function confirmEmailVerification(db: any, rawToken: string) {
  const tokenHash = hashToken(rawToken);
  return db.$transaction(async (tx: any) => {
    const session = await tx.session.findUnique({ where: { tokenHash }, include: { user: { select: { id: true, role: true, status: true } } } });
    if (!session || session.kind !== "email-verify") throw invalidToken();
    const used = await tx.session.deleteMany({ where: { id: session.id } });
    if (!used.count || session.expiresAt <= new Date() || session.user.role !== "PARENT" || session.user.status !== "active") throw invalidToken();
    await tx.user.update({ where: { id: session.userId }, data: { emailVerifiedAt: new Date() } });
    return { verified: true, approvedLinks: await approvePendingLinks(tx, session.userId) };
  });
}
