import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Db } from "../../../db/db";
import { finalizeExpiredSessions } from "./assessment-session";

export const ASSESSMENT_SWEEP_MS = 60_000;

/** Off under tests and when ASSESSMENT_SWEEPER_ENABLED=false; the lazy read paths still auto-submit. */
export const sweeperEnabled = (env: NodeJS.ProcessEnv) => env.NODE_ENV !== "test" && !env.VITEST && env.ASSESSMENT_SWEEPER_ENABLED !== "false";

/**
 * TAI-07 (TAI7-T1, AD-19): auto-submits expired graded sessions whose student never came back, so the teacher board
 * and parent views are complete without anyone opening the assignment. Idempotent with the lazy path (unique sessionId).
 */
@Injectable()
export class AssessmentSessionSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssessmentSessionSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(Db) private readonly db: Db) {}

  onModuleInit() {
    if (!sweeperEnabled(process.env)) return;
    this.timer = setInterval(() => void this.sweep(), ASSESSMENT_SWEEP_MS).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now = new Date()) {
    if (this.running) return 0;
    this.running = true;
    try {
      return await finalizeExpiredSessions(this.db, {}, now);
    } catch (error) {
      this.logger.warn(`assessment sweep failed: ${(error as Error).name}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
