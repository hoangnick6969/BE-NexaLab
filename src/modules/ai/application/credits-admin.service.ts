import { Inject, Injectable, Optional } from "@nestjs/common";
import { cursorWhere, page } from "../../../common/admin-api";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { AI_CREDITS_CONFIG, parseAiCreditsConfig, type AiCreditsConfig } from "../../../config/ai-credits";
import { lock } from "../../classes/application/class-common";
import { idempotencyKeyRequired } from "./ai-job-contract";
import {
  adjustmentBody,
  adminAccountQuery,
  createPricingBody,
  creditBalanceNegative,
  grantBody,
  listPricingQuery,
  MAX_BALANCE,
  pricingNotActiveToRetire,
  pricingNotDraft,
  pricingNotFound,
  teacherNotFound,
} from "./credits-contract";
import { getAccount, LedgerError, post, teacherAccounts } from "./credits-ledger";
import { creditOrigin, ensureStarterCredits } from "./credits-starter";

const pricingView = (row: any) => ({
  id: row.id as string,
  purpose: row.purpose as string,
  version: row.version as number,
  baseCredits: row.baseCredits as number,
  perItemCredits: row.perItemCredits as number,
  creditsPer1kInputTokens: row.creditsPer1kInputTokens as number,
  creditsPer1kOutputTokens: row.creditsPer1kOutputTokens as number,
  evidenceRef: row.evidenceRef as string,
  status: row.status as string,
  createdById: row.createdById as string,
  createdAt: (row.createdAt as Date).toISOString(),
  activatedAt: row.activatedAt ? (row.activatedAt as Date).toISOString() : null,
  retiredAt: row.retiredAt ? (row.retiredAt as Date).toISOString() : null,
});

/**
 * TAI-05 admin operations (Admin<Domain> convention, ADMIN only at the controller): grants, signed adjustments and
 * pricing versions. Grants and adjustments are idempotent per `Idempotency-Key`, locked per teacher, audited with the
 * reason and the resulting balance, and post to the append-only ledger; nothing edits or deletes a posting. A repair of
 * a wrong balance is a new ADJUST. Admin operations work whether or not AI_CREDITS_ENABLED is on, so the ledger can be
 * prepared before the flag is switched.
 */
@Injectable()
export class AiCreditsAdminService {
  constructor(@Inject(Db) private db: Db, @Optional() @Inject(AI_CREDITS_CONFIG) private config: AiCreditsConfig = parseAiCreditsConfig({ AI_STARTER_CREDITS: "0" })) {}

  /** GET admin/credits/accounts?teacherId=: balances and recent transactions of one teacher. Credits only. */
  async account(rawQuery: unknown) {
    const query = adminAccountQuery.parse(rawQuery ?? {});
    const teacher = await this.db.user.findFirst({ where: { id: query.teacherId, role: "TEACHER" }, select: { id: true } });
    if (!teacher) throw teacherNotFound();
    if (this.config.enabled) await ensureStarterCredits(this.db, query.teacherId, this.config);
    const accounts = await this.db.creditAccount.findMany({
      where: { ownerId: query.teacherId, kind: { in: ["TEACHER_AVAILABLE", "TEACHER_RESERVED"] } },
      select: { id: true, kind: true, balance: true },
    });
    const available = accounts.find((a: any) => a.kind === "TEACHER_AVAILABLE");
    const reserved = accounts.find((a: any) => a.kind === "TEACHER_RESERVED");
    if (!available || !reserved) return { teacherId: query.teacherId, available: 0, reserved: 0, transactions: [], nextCursor: null };
    const rows = await this.db.creditTransaction.findMany({
      where: { entries: { some: { accountId: { in: [available.id, reserved.id] } } }, ...cursorWhere(query.cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: {
        id: true, kind: true, systemKey: true, aiJobId: true, pricingVersionId: true, actorId: true, reason: true, createdAt: true,
        entries: { select: { accountId: true, amount: true } },
      },
    });
    const paged = page(rows, query.limit);
    return {
      teacherId: query.teacherId,
      available: available.balance as number,
      reserved: reserved.balance as number,
      transactions: paged.items.map((row: any) => {
        const entries: Array<{ accountId: string; amount: number }> = row.entries;
        const delta = entries.filter((e) => e.accountId === available.id).reduce((s, e) => s + e.amount, 0);
        return {
          id: row.id as string,
          kind: row.kind as string,
          origin: creditOrigin(row),
          credits: delta,
          charged: row.kind === "SETTLE" ? entries.filter((e) => e.accountId !== available.id && e.accountId !== reserved.id).reduce((s, e) => s + e.amount, 0) : null,
          jobId: (row.aiJobId ?? null) as string | null,
          pricingVersionId: (row.pricingVersionId ?? null) as string | null,
          actorId: (row.actorId ?? null) as string | null,
          reason: (row.reason ?? null) as string | null,
          createdAt: (row.createdAt as Date).toISOString(),
        };
      }),
      nextCursor: paged.nextCursor,
    };
  }

  async grant(teacherId: string, req: any, raw: unknown) {
    const body = grantBody.parse(raw);
    return this.signedPosting("GRANT", teacherId, req, body, `POST admin/credits/accounts/${teacherId}/grants`);
  }

  async adjust(teacherId: string, req: any, raw: unknown) {
    const body = adjustmentBody.parse(raw);
    return this.signedPosting("ADJUST", teacherId, req, body, `POST admin/credits/accounts/${teacherId}/adjustments`);
  }

  /** ISSUANCE -g, AVAILABLE +g (g signed). Locks the teacher; an adjustment that would overdraw is 409 CREDIT_BALANCE_NEGATIVE. */
  private async signedPosting(kind: "GRANT" | "ADJUST", teacherId: string, req: any, body: { credits: number; reason: string }, scope: string) {
    const key = readIdempotencyKey(req);
    if (!key) throw idempotencyKeyRequired();
    const ctx = { actorId: req.user.sub as string, key, scope, payload: { credits: body.credits, reason: body.reason } };
    return idempotent(this.db, ctx, async (tx) => {
      const teacher = await tx.user.findFirst({ where: { id: teacherId, role: "TEACHER" }, select: { id: true } });
      if (!teacher) throw teacherNotFound();
      await lock(tx, `ai-credits:${teacherId}`);
      const { available, reserved } = await teacherAccounts(tx, teacherId);
      const issuance = await getAccount(tx, "SYSTEM_ISSUANCE", null);
      const current = (await tx.creditAccount.findFirst({ where: { id: available.id }, select: { balance: true } }))?.balance ?? 0;
      if (current + body.credits < 0) throw creditBalanceNegative(current);
      if (current + body.credits > MAX_BALANCE) throw creditBalanceNegative(current);
      try {
        const posted = await post(tx, {
          kind,
          actorId: req.user.sub,
          reason: body.reason,
          idempotencyKey: key,
          entries: [
            { account: issuance, amount: -body.credits },
            { account: available, amount: body.credits },
          ],
        });
        const balanceAfter = current + body.credits;
        await audit(tx, {
          actor: req.user,
          action: kind === "GRANT" ? "credits.grant" : "credits.adjust",
          targetType: "CreditAccount",
          targetId: available.id,
          reason: body.reason,
          after: { teacherId, credits: body.credits, balanceAfter },
        });
        const reservedBalance = (await tx.creditAccount.findFirst({ where: { id: reserved.id }, select: { balance: true } }))?.balance ?? 0;
        return { transactionId: posted.id, teacherId, credits: body.credits, available: balanceAfter, reserved: reservedBalance };
      } catch (error) {
        if (error instanceof LedgerError && error.code === "INSUFFICIENT_BALANCE") throw creditBalanceNegative(current);
        throw error;
      }
    });
  }

  async listPricing(rawQuery: unknown) {
    const query = listPricingQuery.parse(rawQuery ?? {});
    const rows = await this.db.pricingVersion.findMany({
      where: query.purpose ? { purpose: query.purpose } : {},
      orderBy: [{ purpose: "asc" }, { version: "desc" }],
    });
    return { items: rows.map(pricingView) };
  }

  /** Draft price: the next version of its purpose; `evidenceRef` is required. Active prices are never edited. */
  async createPricing(req: any, raw: unknown) {
    const body = createPricingBody.parse(raw);
    return this.db.$transaction(async (tx: any) => {
      await lock(tx, `ai-credits-pricing:${body.purpose}`);
      const latest = await tx.pricingVersion.findFirst({ where: { purpose: body.purpose }, orderBy: { version: "desc" }, select: { version: true } });
      const row = await tx.pricingVersion.create({
        data: { ...body, version: (latest?.version ?? 0) + 1, status: "draft", createdById: req.user.sub },
      });
      await audit(tx, {
        actor: req.user, action: "credits.pricing.create", targetType: "PricingVersion", targetId: row.id,
        after: { purpose: row.purpose, version: row.version, baseCredits: row.baseCredits, perItemCredits: row.perItemCredits, evidenceRef: row.evidenceRef },
      });
      return pricingView(row);
    });
  }

  /** Activation retires the previous active price of the purpose in the same transaction. Jobs keep their pinned price. */
  async activatePricing(id: string, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const found = await tx.pricingVersion.findUnique({ where: { id }, select: { purpose: true } });
      if (!found) throw pricingNotFound();
      await lock(tx, `ai-credits-pricing:${found.purpose}`);
      const row = await tx.pricingVersion.findUnique({ where: { id } });
      if (!row) throw pricingNotFound();
      if (row.status !== "draft") throw pricingNotDraft();
      const now = new Date();
      await tx.pricingVersion.updateMany({ where: { purpose: row.purpose, status: "active" }, data: { status: "retired", retiredAt: now } });
      const activated = await tx.pricingVersion.update({ where: { id }, data: { status: "active", activatedAt: now } });
      await audit(tx, {
        actor: req.user, action: "credits.pricing.activate", targetType: "PricingVersion", targetId: id,
        after: { purpose: row.purpose, version: row.version, baseCredits: row.baseCredits, perItemCredits: row.perItemCredits, evidenceRef: row.evidenceRef },
      });
      return pricingView(activated);
    });
  }

  /** Retire the active price. New jobs then get 409 PRICING_NOT_ACTIVE (while credits are enabled) until another is activated. */
  async retirePricing(id: string, req: any) {
    return this.db.$transaction(async (tx: any) => {
      const found = await tx.pricingVersion.findUnique({ where: { id }, select: { purpose: true } });
      if (!found) throw pricingNotFound();
      await lock(tx, `ai-credits-pricing:${found.purpose}`);
      const row = await tx.pricingVersion.findUnique({ where: { id } });
      if (!row) throw pricingNotFound();
      if (row.status !== "active") throw pricingNotActiveToRetire();
      const retired = await tx.pricingVersion.update({ where: { id }, data: { status: "retired", retiredAt: new Date() } });
      await audit(tx, {
        actor: req.user, action: "credits.pricing.retire", targetType: "PricingVersion", targetId: id,
        after: { purpose: row.purpose, version: row.version, baseCredits: row.baseCredits, perItemCredits: row.perItemCredits, evidenceRef: row.evidenceRef },
      });
      return pricingView(retired);
    });
  }
}
