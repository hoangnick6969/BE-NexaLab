import type { AiConfig } from "./ai-config";
import { PROVIDER_SIDE_FAILURES } from "./ai-job-contract";

export const DAY_MS = 24 * 3600_000;

/**
 * Daily and concurrency usage for one actor and purpose (job-runtime-and-failure-modes.md, "Quota"). `limits` overrides
 * the GENERATE_RESOURCE limits for another purpose (TAI-02 ASSESS_SUBMISSION: AI_DAILY_ASSESSMENT_LIMIT, no concurrency limit).
 */
export async function quotaUsage(db: any, actorId: string, purpose: string, config: AiConfig, now = new Date(), limits?: { daily: number; concurrency: number | null }) {
  const since = new Date(now.getTime() - DAY_MS);
  const counted = {
    actorId,
    purpose,
    createdAt: { gt: since },
    NOT: { status: "FAILED", failureCode: { in: [...PROVIDER_SIDE_FAILURES] } },
  };
  const [usedLast24h, activeJobs, oldest] = await Promise.all([
    db.aiJob.count({ where: counted }),
    db.aiJob.count({ where: { actorId, purpose, status: { in: ["PENDING", "RUNNING"] } } }),
    db.aiJob.findFirst({ where: counted, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return {
    purpose,
    dailyLimit: limits ? limits.daily : config.dailyJobLimit,
    usedLast24h,
    activeJobs,
    concurrencyLimit: limits ? limits.concurrency : config.concurrentJobLimit,
    resetsAt: oldest ? new Date(oldest.createdAt.getTime() + DAY_MS) : null,
  };
}

