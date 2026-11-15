import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { z } from "zod";
import { cursorWhere, page } from "../../../common/admin-api";
import { audit } from "../../../common/audit";
import { AI_CREDITS_CONFIG, PRICED_PURPOSES, type AiCreditsConfig } from "../../../config/ai-credits";
import { Db } from "../../../db/db";
import { ownedClass } from "../../classes/application/class-access";
import { lock } from "../../classes/application/class-common";
import { createAiJobBody } from "./ai-job-contract";
import { slotCount } from "./assessment-blueprint";
import { aiCreditsInsufficient, aiEstimateChanged, myCreditsQuery, pricingNotActive } from "./credits-contract";
import { ensureSystemAccounts, getAccount, LedgerError, post, teacherAccounts } from "./credits-ledger";
import { chargeCredits, estimateCredits, tokenCostCredits, type PriceTable } from "./credits-pricing";

export type PricingRow = PriceTable & { id: string; purpose: string; version: number };
export type Quote = { credits: number; price: PricingRow };
export type Finalized = { chargedCredits?: number; refundedCredits?: number };

const assessEstimateBody = z.object({ purpose: z.literal("ASSESS_SUBMISSION"), submissionCount: z.number().int().min(1).max(50) }).strict();
/** One ASSESS_SUBMISSION job covers one submission. */
const ASSESS_REQUESTED = 1;

/** Transaction row -> teacher-facing view: credits only. No token counts, provider name or provider price. */
export function toTeacherTransactionView(row: any, accountIds: { available: string; reserved: string }) {
  const entries: Array<{ accountId: string; amount: number }> = row.entries ?? [];
  const sum = (predicate: (e: { accountId: string }) => boolean) => entries.filter(predicate).reduce((total, e) => total + e.amount, 0);
  return {
    id: row.id as string,
    kind: row.kind as string,
    /** Signed effect on the available balance: GRANT +, ADJUST +/-, RESERVE -, SETTLE + (the unspent part), REFUND +. */
    credits: sum((e) => e.accountId === accountIds.available),
    /** SETTLE only: what the job actually cost. */
    charged: row.kind === "SETTLE" ? sum((e) => e.accountId !== accountIds.available && e.accountId !== accountIds.reserved) : null,
    jobId: (row.aiJobId ?? null) as string | null,
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

/**
 * TAI-05 credit lifecycle for AI jobs (ledger-rules.md). Every method that writes takes the caller's transaction, so
 * RESERVE commits with the AiJob insert and SETTLE or REFUND commits with the terminal transition; there is no
 * separate settlement worker. A job is settled when it carries `estimatedCredits`, whatever AI_CREDITS_ENABLED says
 * at that moment, so switching the flag off never strands a reservation.
 */
@Injectable()
export class AiCreditsService implements OnModuleInit {
  private readonly logger = new Logger("AiCredits");

  constructor(
    @Inject(Db) private db: Db,
    @Inject(AI_CREDITS_CONFIG) private config: AiCreditsConfig,
  ) {}

  get enabled() {
    return this.config.enabled;
  }

  /** With credits enabled: seed the system accounts and, unless disabled, price version 1 of any purpose without a row. */
  async onModuleInit() {
    if (!this.config.enabled) return;
    try {
      await ensureSystemAccounts(this.db);
      if (this.config.seedBaseline) await this.ensureBaselinePricing();
    } catch (error) {
      this.logger.warn(`credits bootstrap failed: ${(error as Error).name}`);
    }
  }

  /** Version 1 of a purpose with no PricingVersion row: the team-lead baseline (config), active, audited, idempotent. */
  async ensureBaselinePricing() {
    for (const purpose of PRICED_PURPOSES) {
      if (await this.db.pricingVersion.findFirst({ where: { purpose }, select: { id: true } })) continue;
      const baseline = this.config.baseline[purpose];
      try {
        await this.db.$transaction(async (tx: any) => {
          const row = await tx.pricingVersion.create({
            data: { purpose, version: 1, ...baseline, evidenceRef: this.config.evidenceRef, status: "active", createdById: "system", activatedAt: new Date() },
          });
          await audit(tx, {
            actor: null, action: "credits.pricing.create", targetType: "PricingVersion", targetId: row.id,
            after: { purpose, version: 1, baseCredits: baseline.baseCredits, perItemCredits: baseline.perItemCredits, evidenceRef: this.config.evidenceRef },
          });
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error; // another instance seeded it first
      }
    }
  }

  /** The active price of a purpose and the estimate for a requested count. 409 PRICING_NOT_ACTIVE without a price. */
  async quote(db: any, purpose: string, requestedCount: number): Promise<Quote> {
    const price = await db.pricingVersion.findFirst({
      where: { purpose, status: "active" },
      orderBy: { version: "desc" },
      select: { id: true, purpose: true, version: true, baseCredits: true, perItemCredits: true, creditsPer1kInputTokens: true, creditsPer1kOutputTokens: true },
    });
    if (!price) throw pricingNotActive(purpose);
    return { credits: estimateCredits(price, requestedCount), price };
  }

  /** Create path: recompute the estimate under the active price and compare with the confirmed value. */
  async confirm(tx: any, purpose: string, requestedCount: number, confirmed: number): Promise<Quote> {
    const quote = await this.quote(tx, purpose, requestedCount);
    if (confirmed !== quote.credits) throw aiEstimateChanged(quote.credits, quote.price.version);
    return quote;
  }

  /**
   * RESERVE in the create transaction: AVAILABLE -E, RESERVED +E. The per-teacher lock serializes creates of every
   * purpose (the quota lock is per purpose); the conditional decrement in `post` is the lock-free guarantee, so two
   * creates at the balance boundary can never overdraw. 402 with `available` and `required` when the balance is short.
   */
  async reserve(tx: any, input: { jobId: string; actorId: string; credits: number; pricingVersionId: string }) {
    await lock(tx, `ai-credits:${input.actorId}`);
    const { available, reserved } = await teacherAccounts(tx, input.actorId);
    try {
      await post(tx, {
        kind: "RESERVE",
        aiJobId: input.jobId,
        pricingVersionId: input.pricingVersionId,
        actorId: input.actorId,
        entries: [
          { account: available, amount: -input.credits },
          { account: reserved, amount: input.credits },
        ],
      });
    } catch (error) {
      if (error instanceof LedgerError && error.code === "INSUFFICIENT_BALANCE") {
        const current = await tx.creditAccount.findFirst({ where: { id: available.id }, select: { balance: true } });
        throw aiCreditsInsufficient(current?.balance ?? 0, input.credits);
      }
      throw error;
    }
  }

  /**
   * SETTLE (job SUCCEEDED) or REFUND (job FAILED or CANCELLED), inside the terminal-transition transaction, keyed by
   * AiJob.id. The caller has just won the conditional status update, so it holds the job row lock and is the only
   * writer; the existence check and the unique (aiJobId, kind) index make a replay a no-op. A job without
   * `estimatedCredits` (created with credits off) is untouched. The charge never exceeds the reservation, and the
   * pinned price is used, not the currently active one.
   */
  async finalize(tx: any, jobId: string, outcome: { kind: "SETTLE"; validCount: number } | { kind: "REFUND" }): Promise<Finalized> {
    const job = await tx.aiJob.findUnique({
      where: { id: jobId },
      select: { id: true, actorId: true, status: true, purpose: true, request: true, estimatedCredits: true, pricingVersionId: true, inputTokens: true, outputTokens: true },
    });
    if (!job || job.estimatedCredits === null || job.estimatedCredits === undefined) return {};
    const expected = outcome.kind === "SETTLE" ? ["SUCCEEDED"] : ["FAILED", "CANCELLED"];
    if (!expected.includes(job.status)) {
      this.logger.error(`job ${jobId}: ${outcome.kind} requested while status is ${job.status}; nothing posted`);
      return {};
    }
    const prior = await tx.creditTransaction.findMany({ where: { aiJobId: jobId, kind: { in: ["RESERVE", "SETTLE", "REFUND"] } }, select: { kind: true } });
    const kinds = new Set<string>(prior.map((row: { kind: string }) => row.kind));
    if (kinds.has("SETTLE") || kinds.has("REFUND")) return {};
    if (!kinds.has("RESERVE")) {
      this.logger.error(`job ${jobId}: carries an estimate but has no RESERVE; nothing posted`);
      return {};
    }
    const estimate: number = job.estimatedCredits;
    const { available, reserved } = await teacherAccounts(tx, job.actorId);
    let charged = 0;
    if (outcome.kind === "SETTLE") {
      const price = job.pricingVersionId
        ? await tx.pricingVersion.findUnique({
            where: { id: job.pricingVersionId },
            select: { baseCredits: true, perItemCredits: true, creditsPer1kInputTokens: true, creditsPer1kOutputTokens: true },
          })
        : null;
      if (!price) this.logger.error(`job ${jobId}: pinned price ${job.pricingVersionId} is missing; charging nothing`);
      else {
        const requestedCount = job.purpose === "ASSESS_SUBMISSION" ? ASSESS_REQUESTED : Number((job.request as { itemCount?: unknown })?.itemCount ?? 0);
        charged = chargeCredits({ estimate, tokenCost: tokenCostCredits(price, job.inputTokens, job.outputTokens), validCount: outcome.validCount, requestedCount });
      }
      const consumed = await getAccount(tx, "SYSTEM_CONSUMED", null);
      await post(tx, {
        kind: "SETTLE",
        aiJobId: jobId,
        pricingVersionId: job.pricingVersionId,
        entries: [
          { account: reserved, amount: -estimate },
          { account: consumed, amount: charged },
          { account: available, amount: estimate - charged },
        ],
      });
    } else {
      await post(tx, {
        kind: "REFUND",
        aiJobId: jobId,
        pricingVersionId: job.pricingVersionId,
        entries: [
          { account: reserved, amount: -estimate },
          { account: available, amount: estimate },
        ],
      });
    }
    await tx.aiJob.updateMany({ where: { id: jobId }, data: { chargedCredits: charged } });
    return outcome.kind === "SETTLE" ? { chargedCredits: charged } : { refundedCredits: estimate };
  }

  /** POST classes/:id/ai-jobs/estimate (owner only). Writes nothing; an unknown balance is reported as 0. */
  async estimate(classId: string, req: any, raw: unknown) {
    const body = (raw as { purpose?: unknown } | null)?.purpose === "ASSESS_SUBMISSION" ? assessEstimateBody.parse(raw) : createAiJobBody.parse(raw);
    await ownedClass(this.db, classId, req.user);
    if (!this.config.enabled) return { enabled: false, credits: 0, pricingVersion: null, available: 0 };
    // GENERATE_RESOURCE: one job priced by its item count. ASSESS_SUBMISSION: one job per submission, so the ceiling for
    // N submissions is N unit prices (the value the request route compares with `confirmedCredits`).
    const requestedCount = body.purpose === "ASSESS_SUBMISSION" ? ASSESS_REQUESTED : body.purpose === "DRAFT_LAB_CHALLENGE" ? body.proposalCount : body.purpose === "GENERATE_ASSESSMENT" ? slotCount(body.sections) : body.itemCount;
    const quote = await this.quote(this.db, body.purpose, requestedCount);
    const credits = body.purpose === "ASSESS_SUBMISSION" ? quote.credits * body.submissionCount : quote.credits;
    const account = await this.db.creditAccount.findFirst({ where: { kind: "TEACHER_AVAILABLE", ownerId: req.user.sub }, select: { balance: true } });
    return { enabled: true, credits, pricingVersion: quote.price.version, available: account?.balance ?? 0 };
  }

  /** GET /me/credits: available, reserved and history in credits only, newest first, cursor-paginated. */
  async myCredits(req: any, rawQuery: unknown) {
    const query = myCreditsQuery.parse(rawQuery ?? {});
    if (!this.config.enabled) return { enabled: false, available: 0, reserved: 0, transactions: [], nextCursor: null };
    const accounts = await this.db.creditAccount.findMany({
      where: { ownerId: req.user.sub, kind: { in: ["TEACHER_AVAILABLE", "TEACHER_RESERVED"] } },
      select: { id: true, kind: true, balance: true },
    });
    const available = accounts.find((a: any) => a.kind === "TEACHER_AVAILABLE");
    const reserved = accounts.find((a: any) => a.kind === "TEACHER_RESERVED");
    if (!available || !reserved) return { enabled: true, available: 0, reserved: 0, transactions: [], nextCursor: null };
    const rows = await this.db.creditTransaction.findMany({
      where: { entries: { some: { accountId: { in: [available.id, reserved.id] } } }, ...cursorWhere(query.cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: { id: true, kind: true, aiJobId: true, createdAt: true, entries: { select: { accountId: true, amount: true } } },
    });
    const paged = page(rows, query.limit);
    const ids = { available: available.id as string, reserved: reserved.id as string };
    return {
      enabled: true,
      available: available.balance as number,
      reserved: reserved.balance as number,
      transactions: paged.items.map((row: any) => toTeacherTransactionView(row, ids)),
      nextCursor: paged.nextCursor,
    };
  }
}
