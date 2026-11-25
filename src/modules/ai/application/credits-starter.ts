import { audit } from "../../../common/audit";
import { TX_LIMITS } from "../../../common/idempotency";
import type { AiCreditsConfig } from "../../../config/ai-credits";
import { lock } from "../../classes/application/class-common";
import { getAccount, post, teacherAccounts } from "./credits-ledger";

export const starterKey = (teacherId: string) => `starter:v1:${teacherId}`;

export function creditOrigin(row: { kind: string; systemKey?: string | null }): "STARTER" | "PAYMENT" | "ADMIN" | null {
  if (row.systemKey?.startsWith("starter:")) return "STARTER";
  if (row.systemKey?.startsWith("payment:")) return "PAYMENT";
  return row.kind === "GRANT" || row.kind === "ADJUST" ? "ADMIN" : null;
}

export async function grantStarterCredits(tx: any, teacherId: string, config: Pick<AiCreditsConfig, "starterCredits">): Promise<{ granted: boolean; credits: number }> {
  const credits = config.starterCredits;
  if (credits <= 0) return { granted: false, credits: 0 };
  const teacher = await tx.user.findFirst({ where: { id: teacherId, role: "TEACHER", status: "active" }, select: { id: true } });
  if (!teacher) return { granted: false, credits: 0 };
  const issuance = await getAccount(tx, "SYSTEM_ISSUANCE", null);
  const { available } = await teacherAccounts(tx, teacherId);
  await lock(tx, `ai-credits:${teacherId}`);
  const systemKey = starterKey(teacherId);
  if (await tx.creditTransaction.findUnique({ where: { systemKey }, select: { id: true } })) return { granted: false, credits: 0 };
  await post(tx, {
    kind: "GRANT", actorId: null, systemKey,
    reason: `Quà khởi đầu: ${credits} tín dụng miễn phí`,
    entries: [{ account: issuance, amount: -credits }, { account: available, amount: credits }],
  });
  await audit(tx, { actor: null, action: "ai_credits.starter_grant", targetType: "User", targetId: teacherId, after: { credits } });
  return { granted: true, credits };
}

export async function ensureStarterCredits(db: any, teacherId: string, config: Pick<AiCreditsConfig, "starterCredits">): Promise<{ granted: boolean; credits: number }> {
  if (config.starterCredits <= 0) return { granted: false, credits: 0 };
  if (await db.creditTransaction.findUnique({ where: { systemKey: starterKey(teacherId) }, select: { id: true } })) return { granted: false, credits: 0 };
  return db.$transaction((tx: any) => grantStarterCredits(tx, teacherId, config), TX_LIMITS);
}
