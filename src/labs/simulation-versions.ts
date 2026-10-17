import { z } from "zod";
import { VERSION as ENGINE_VERSION, eyeParts } from "../../packages/sim";
import { modelRefForLab, resolveModel } from "./sim-packs";
import { CHALLENGE_PARAMETERS, type ChallengeParams, challengeParamErrors, evaluateChallenge } from "../lessons/lesson-content";

/**
 * C2-T3: immutable simulation configuration versions. A version pins the
 * allowlisted model reference and per-challenge parameters; it is stored only
 * after its golden cases reproduce on the server engine. Activating a version
 * changes future attempts; past attempts keep the version they pinned.
 */
export const ENGINE = ENGINE_VERSION;
export const VERDICTS = ["passed", "partial", "needs_practice"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const normalizeVerdict = (verdict: string): string => (verdict === "not_passed" ? "needs_practice" : verdict);

const MAX_LAB_STATE = 20000;
export const versionInputSchema = z
  .object({
    challengeParams: z.record(z.string().max(80), z.record(z.string().max(40), z.union([z.number(), z.string().max(60)]))),
    goldenCases: z
      .array(
        z
          .object({
            challengeId: z.string().max(80),
            label: z.string().trim().min(1).max(120),
            labState: z.unknown(),
            expectedVerdict: z.enum(VERDICTS),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export type VersionInput = z.infer<typeof versionInputSchema>;

/** Server-side evaluation shared by attempts, golden cases and reproduction. */
export function evaluate(labId: string, labState: unknown, params: ChallengeParams | null | undefined, modelRef?: string | null) {
  // CF-T4: allowlisted model resolution; a lab without a registered model fails closed.
  const ref = modelRef ?? modelRefForLab(labId);
  if (!ref) throw new Error("Lab không tồn tại");
  let result: any = resolveModel(ref).simulate(labState);
  const variant = evaluateChallenge(labId, labState, result, params ?? null);
  if (variant.check) result = { ...result, verdict: variant.verdict, challengeCheck: variant.check };
  return { result, verdict: normalizeVerdict(result.verdict) };
}

/** Structural problems: unknown model, mismatched challenge, out-of-range or non-allowlisted parameter. */
export function versionErrors(labId: string, baseChallengeIds: string[], input: VersionInput): string[] {
  const spec = CHALLENGE_PARAMETERS[labId];
  if (!spec) return [`Mô hình "${labId}" không nằm trong danh sách cho phép`];
  const errors: string[] = [];
  const base = new Set(baseChallengeIds);
  for (const [challengeId, params] of Object.entries(input.challengeParams)) {
    if (!base.has(challengeId)) errors.push(`Thử thách "${challengeId}" không thuộc phòng thực hành này`);
    else for (const error of challengeParamErrors(labId, params)) errors.push(`${challengeId}: ${error}`);
  }
  for (const [index, golden] of input.goldenCases.entries()) {
    if (!base.has(golden.challengeId))
      errors.push(`Ca mẫu ${index + 1}: thử thách "${golden.challengeId}" không thuộc phòng thực hành này`);
    if (JSON.stringify(golden.labState ?? null).length > MAX_LAB_STATE) errors.push(`Ca mẫu ${index + 1}: trạng thái quá lớn`);
  }
  for (const challengeId of Object.keys(input.challengeParams))
    if (!input.goldenCases.some((golden) => golden.challengeId === challengeId))
      errors.push(`Thử thách "${challengeId}" cần ít nhất một ca mẫu`);
  return errors;
}

/** Runs every golden case with the candidate parameters on the server engine. */
export function goldenCaseResults(labId: string, input: VersionInput) {
  return input.goldenCases.map((golden) => {
    let actual: string;
    try {
      actual = evaluate(labId, golden.labState, input.challengeParams[golden.challengeId] ?? null).verdict;
    } catch {
      actual = "invalid";
    }
    return {
      label: golden.label,
      challengeId: golden.challengeId,
      expected: golden.expectedVerdict,
      actual,
      ok: actual === golden.expectedVerdict,
    };
  });
}

/** Parameters a base challenge is evaluated with under a version (null: model default). */
export function versionParams(version: { challengeParams: unknown } | null | undefined, challengeId: string): ChallengeParams | null {
  const params = (version?.challengeParams as Record<string, ChallengeParams> | undefined)?.[challengeId];
  return params && Object.keys(params).length ? params : null;
}

const circuitState = (resistance: number, closed = true) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    { id: "r", type: "resistor", value: resistance },
    { id: "l", type: "led" },
  ],
  edges: [{ source: "b", target: "r" }, { source: "r", target: "l" }, ...(closed ? [{ source: "l", target: "b" }] : [])],
});

/** Representative states an admin starts golden cases from; expectations are the reviewer's to state. */
export function goldenTemplates(labId: string) {
  if (labId === "circuit")
    return [
      { label: "Mạch hở", labState: circuitState(470, false) },
      { label: "9 V, 100 Ω (quá dòng)", labState: circuitState(100) },
      { label: "9 V, 470 Ω (≈15 mA)", labState: circuitState(470) },
      { label: "9 V, 1000 Ω (≈7 mA)", labState: circuitState(1000) },
    ];
  if (labId === "chemistry")
    return [
      { label: "Mg + HCl vừa đủ (0,1 : 0,2 mol)", labState: { reactionId: "mg-hcl", molesA: 0.1, molesB: 0.2 } },
      { label: "Mg + HCl còn dư (0,1 : 0,1 mol)", labState: { reactionId: "mg-hcl", molesA: 0.1, molesB: 0.1 } },
    ];
  if (labId === "eye") {
    const all = Object.fromEntries(eyeParts.map((part) => [part.id, part.name]));
    const half = Object.fromEntries(eyeParts.slice(0, Math.ceil(eyeParts.length / 2)).map((part) => [part.id, part.name]));
    return [
      { label: "Chưa gọi tên bộ phận nào", labState: { answers: {} } },
      { label: "Gọi đúng khoảng một nửa", labState: { answers: half } },
      { label: "Gọi đúng tất cả", labState: { answers: all } },
    ];
  }
  return [];
}
