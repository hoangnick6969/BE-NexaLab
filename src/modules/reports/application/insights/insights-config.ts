export const INSIGHTS_CONFIG = Symbol("INSIGHTS_CONFIG");

export type InsightsConfig = {
  /** Pilot visibility of the SUDDEN_UNAIDED_PASS pattern (PO decision, gate G-5): off unless explicitly enabled. */
  showSuddenUnaidedPass: boolean;
  /**
   * TAI7-T2: list retired rules (insights@1 SCORE_CHANGE_UNUSUAL) on the read routes. Never parsed from the environment;
   * only the TAI-04 mechanics tests set it. Absent means retired rules are hidden.
   */
  includeRetired?: boolean;
};

/** Parses the insights environment. The error names the variable only, never its value. */
export function parseInsightsConfig(env: NodeJS.ProcessEnv): InsightsConfig {
  const raw = env.INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS?.trim().toLowerCase();
  if (!raw) return { showSuddenUnaidedPass: false };
  if (raw !== "true" && raw !== "false") throw new Error("INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS must be true or false");
  return { showSuddenUnaidedPass: raw === "true" };
}
