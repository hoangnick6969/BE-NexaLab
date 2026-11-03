import { z } from "zod";
import { simulateBuoyancy, buoyancyConfigSchema } from "../../../../packages/sim/buoyancy";
import { eyeOptics } from "../../../../packages/sim/eye-optics";
import { VERSION as ENGINE_VERSION, circuit, circuitBulb, chemistry, densityBench, ecologyTolerance, emInduction, foodWeb, eye, eyeParts, evaluateMassConservation, evaluateLeverBench, evaluateThermalBench, geneExpression } from "../../../../packages/sim";
import { CHALLENGE_PARAMETERS } from "../../lessons/application/lesson-content";
import { digestOf } from "../../content/application/content-pack";

/**
 * CF-T4 practical and simulation pack registry. Scientific behaviour comes
 * only from allowlisted server models resolved by `modelRef`; a pack pins an
 * immutable reviewed activity, template (units, ranges, golden cases), visual
 * asset, semantic node map, declarative bindings and challenge templates. A
 * manifest never carries executable code.
 */
type Model = {
  labId: string;
  engineVersion: string;
  simulate: (state: unknown) => any;
  /** Output fields bindings may read. */
  outputs: Record<string, "number" | "string" | "array">;
  /** Semantic IDs every visual for this model must map. */
  requiredSemanticIds: string[];
  /**
   * The model reports scientific observations only: it has no learner verdict
   * and no challenge parameters; the pinned activity rubric assesses learning.
   */
  /** Lower-case clause used in configuration errors. */
  observationOnly?: { unsupportedParams: string };
};
export const MODEL_REGISTRY: Record<string, Model> = {
  "thermal-bench@1.0.0": {
    labId: "thermal-energy", engineVersion: "1.0.0",
    simulate: (state) => {
      const result = evaluateThermalBench(state);
      if (!result.ok) throw new Error(`Invalid thermal state: ${result.code}`);
      return result.value;
    },
    outputs: { inputEnergyMilliJoules: "number", temperatureMilliCelsius: "number", riseMilliCelsius: "number", heaterState: "string" },
    requiredSemanticIds: ["calorimeter", "heater", "joulemeter", "thermometer"],
    observationOnly: { unsupportedParams: "mô hình nhiệt dùng fixture cố định thay vì tham số thử thách" },
  },
  "buoyancy@1.0.0": {
    labId: "buoyancy",
    engineVersion: "1.0.0",
    simulate: (input) => simulateBuoyancy(z.object({ massKg: z.number().positive(), volumeM3: z.number().positive(), submergedVolumeM3: z.number().nonnegative(), fluidDensityKgM3: z.number().positive(), gravity: z.number().positive().optional() }).strict().parse(input)),
    outputs: { weightN: "number", buoyantForceN: "number", springForceN: "number", overflowM3: "number" },
    requiredSemanticIds: ["specimen", "dynamometer", "overflow-can", "collector"],
    observationOnly: { unsupportedParams: "buoyancy model uses pinned specimen and fluid parameters" },
  },
  "lever-bench@1.0.0": {
    labId: "lever-equilibrium", engineVersion: "1.0.0",
    simulate: (state) => {
      const result = evaluateLeverBench(state);
      if (!result.ok) throw new Error(`Invalid lever state: ${result.code}`);
      return result.value;
    },
    outputs: { netMomentMilliNewtonMillimetres: "number", displayState: "string", balance: "string" },
    requiredSemanticIds: ["lever", "fulcrum", "weight", "force-gauge"],
    observationOnly: { unsupportedParams: "mô hình đòn bẩy dùng trạng thái móc đã kiểm tra thay vì tham số thử thách" },
  },
  "mass-conservation@1.0.0": {
    labId: "mass-conservation",
    engineVersion: "1.0.0",
    simulate: (input) => {
      const result = evaluateMassConservation(input);
      if (!result.ok) throw new Error(`Invalid conservation fixture: ${result.code}`);
      // Pack golden checks use a valid observation, not a learning verdict.
      return { ...result.value, verdict: "passed" };
    },
    outputs: { beforeScaleMilligrams: "number", afterScaleMilligrams: "number", verdict: "string" },
    requiredSemanticIds: ["scale", "cup-1", "cup-2"],
  },
  "circuit@1.0.0": {
    labId: "circuit",
    engineVersion: ENGINE_VERSION,
    simulate: circuit,
    outputs: {
      current: "number",
      currentMa: "number",
      voltage: "number",
      resistance: "number",
      ledState: "string",
      status: "string",
      verdict: "string",
    },
    requiredSemanticIds: ["battery", "resistor", "led"],
  },
  "circuit-bulb@1.0.0": {
    labId: "circuit",
    engineVersion: ENGINE_VERSION,
    simulate: circuitBulb,
    outputs: { circuitPath: "string", bulbState: "string" },
    requiredSemanticIds: ["battery", "bulb", "switch"],
    observationOnly: { unsupportedParams: "mô hình bóng đèn không dùng tham số thử thách LED" },
  },
  "em-induction@1.0.0": {
    labId: "em-induction",
    engineVersion: ENGINE_VERSION,
    simulate: emInduction,
    outputs: { setup: "string", fieldThroughCoil: "string", inducedCurrent: "string", direction: "string", currentKind: "string", reversalsPerTurn: "number", phaseDirections: "array" },
    requiredSemanticIds: ["coil", "magnet", "galvanometer", "led-pair", "generator"],
    observationOnly: { unsupportedParams: "mô hình quan sát không dùng tham số thử thách" },
  },
  "density-bench@1.0.0": {
    labId: "density",
    engineVersion: ENGINE_VERSION,
    simulate: densityBench,
    outputs: { version: "string", explore: "array" },
    requiredSemanticIds: ["balance", "cylinder", "ruler"],
    observationOnly: { unsupportedParams: "mô hình khối lượng riêng không dùng tham số thử thách" },
  },
  "food-web@1.0.0": {
    labId: "food-web",
    engineVersion: ENGINE_VERSION,
    simulate: foodWeb,
    outputs: { setup: "string", removed: "string", length: "number", brokenChains: "number", levelsKJ: "array", heatKJ: "array" },
    requiredSemanticIds: ["food-web", "energy-pyramid", "causes"],
    observationOnly: { unsupportedParams: "mô hình lưới thức ăn không dùng tham số thử thách" },
  },
  "gene-expression@1.0.0": {
    labId: "gene-protein",
    engineVersion: ENGINE_VERSION,
    simulate: geneExpression,
    outputs: { version: "string", mrna: "string", aminoAcids: "array", codons: "array" },
    requiredSemanticIds: ["dna", "mrna", "ribosome"],
    observationOnly: { unsupportedParams: "mô hình từ gene đến protein không dùng tham số thử thách" },
  },
  "ecology-tolerance@1.0.0": {
    labId: "ecology-tolerance",
    engineVersion: ENGINE_VERSION,
    simulate: ecologyTolerance,
    outputs: { setup: "string", zone: "string", widthDeciC: "number", candidates: "array", count: "number", amount: "number", unit: "string", pyramid: "string" },
    requiredSemanticIds: ["pond", "thermometer", "tolerance-graph", "population-plot", "age-pyramid"],
    observationOnly: { unsupportedParams: "mô hình sinh thái không dùng tham số thử thách" },
  },
  "chemistry@1.0.0": {
    labId: "chemistry",
    engineVersion: ENGINE_VERSION,
    simulate: chemistry,
    outputs: {
      extent: "number",
      remainingA: "number",
      remainingB: "number",
      limiting: "string",
      phenomenon: "string",
      color: "string",
      verdict: "string",
    },
    requiredSemanticIds: ["reactant-a", "reactant-b", "product"],
  },
  "eye@1.0.0": {
    labId: "eye",
    engineVersion: ENGINE_VERSION,
    simulate: eye,
    outputs: { score: "number", correct: "array", verdict: "string" },
    requiredSemanticIds: eyeParts.map((p) => p.id),
  },
  // FL-16 is its own Lab, so its active config/pack never replace the legacy eye@1.0.0 ones.
  "eye-optics@1.0.0": {
    labId: "eye-optics",
    engineVersion: ENGINE_VERSION,
    simulate: eyeOptics,
    outputs: { version: "string", phase1: "array", phase2: "array" },
    requiredSemanticIds: eyeParts.map((p) => p.id),
    observationOnly: { unsupportedParams: "mô hình mắt không dùng tham số thử thách" },
  },
};
/** Allowlisted model resolution replacing dispatch on hardcoded lab IDs. Unknown references fail closed. */
export function resolveModel(modelRef: string) {
  const model = MODEL_REGISTRY[modelRef];
  if (!model) throw new Error(`Mô hình ${modelRef} không nằm trong danh sách cho phép`);
  return model;
}
/** Observation-only declaration of an allowlisted model, or null. */
export const observationOnlyModel = (modelRef: string | null | undefined) => (modelRef && MODEL_REGISTRY[modelRef]?.observationOnly) || null;
export const modelRefForLab = (labId: string) => Object.entries(MODEL_REGISTRY).find(([, m]) => m.labId === labId)?.[0] ?? null;

const text = (max: number) => z.string().trim().min(1).max(max);
const reviewer = z
  .object({
    name: text(120),
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase()),
    at: z.string().datetime(),
  })
  .strict();
export const activitySpecSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/),
    outcomeCodes: z.array(text(40)).min(1).max(20),
    objective: text(500),
    materials: z.array(text(200)).min(1).max(30),
    setup: text(2000),
    procedure: z.array(text(500)).min(1).max(30),
    variables: z
      .array(z.object({ name: text(100), unit: z.string().max(20), role: z.enum(["independent", "dependent", "controlled"]) }).strict())
      .min(1)
      .max(20),
    observations: z.array(text(300)).min(1).max(20),
    expectedResult: text(1000),
    explanation: text(2000),
    safety: text(1000),
    limitations: text(1000),
    modality: z.enum(["real-only", "video", "animation", "interactive-3d", "deterministic-simulation", "virtual-lab"]),
    sources: z
      .array(z.object({ title: text(300), url: z.string().url().optional(), license: text(40) }).strict())
      .min(1)
      .max(20),
    reviews: z.union([
      z.object({ subject: reviewer, safety: reviewer }).strict(),
      z.object({ ownerSignoffPending: z.literal(true) }).strict(),
    ]).optional(),
  })
  .strict();

const FORBIDDEN = /javascript:|https?:\/\/|data:|<\s*script|=>|function\s*\(|eval\s*\(|import\s*\(/i;
const noCode = z
  .string()
  .max(120)
  .refine((v) => !FORBIDDEN.test(v), "Không cho phép mã thực thi hoặc URI ngoài");
const VERDICTS = ["passed", "partial", "needs_practice"] as const;
export const packInputSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/),
    labId: z.string().max(40),
    modelRef: z.string().max(60),
    activityVersionId: z.string().max(40),
    template: z
      .object({
        units: z.record(z.string().max(40), z.string().max(20)),
        /** Teacher-adjustable ranges; must lie within the model's allowlisted ranges. */
        ranges: z.record(z.string().max(40), z.object({ min: z.number(), max: z.number() }).strict()),
        initialState: z.unknown(),
        limitations: text(1000),
        buoyancy: buoyancyConfigSchema.optional(),
        goldenCases: z
          .array(
            z
              .object({
                label: text(120),
                state: z.unknown(),
                expectedVerdict: z.enum(VERDICTS),
                expectedOutputs: z.record(z.string().max(40), z.union([z.number(), z.string().max(60)])).default({}),
                tolerance: z.number().min(0).max(1).default(1e-6),
              })
              .strict(),
          )
          .min(2)
          .max(40),
      })
      .strict(),
    visualAssetVersionId: z.string().max(40).nullable().default(null),
    /** semantic ID → GLB node name (or a 2D element ID when there is no GLB). */
    semanticMap: z.record(z.string().regex(/^[a-z0-9:-]{1,60}$/), noCode),
    bindings: z
      .array(
        z
          .object({
            when: z
              .object({
                output: z.string().max(40),
                op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "includes"]),
                value: z.union([z.number(), noCode]),
              })
              .strict(),
            target: z.string().max(60),
            effect: z.discriminatedUnion("type", [
              z.object({ type: z.literal("visibility"), value: z.boolean() }).strict(),
              z.object({ type: z.literal("emissive"), value: z.number().min(0).max(10) }).strict(),
              z.object({ type: z.literal("color"), value: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(),
              z.object({ type: z.literal("scale"), value: z.number().min(0.1).max(10) }).strict(),
              z.object({ type: z.literal("label"), value: noCode }).strict(),
              z.object({ type: z.literal("animation"), value: noCode }).strict(),
            ]),
          })
          .strict(),
      )
      .max(100),
    challengeTemplates: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{2,60}$/),
            objective: text(300),
            params: z.record(z.string().max(40), z.object({ min: z.number(), max: z.number() }).strict()),
            difficulty: z.enum(["basic", "intermediate", "advanced"]),
          })
          .strict(),
      )
      .max(20),
    reviews: z.union([
      z.object({ subject: reviewer, model: reviewer }).strict(),
      z.object({ ownerSignoffPending: z.literal(true) }).strict(),
    ]).default({ ownerSignoffPending: true }),
    /** Q-C2-04 approval reference for the ranges; required to activate outside development/test. */
    rangeApproval: z
      .object({ reference: text(200), approvedBy: reviewer })
      .strict()
      .optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export type PackInput = z.infer<typeof packInputSchema>;

const normalize = (verdict: string) => (verdict === "not_passed" ? "needs_practice" : verdict);
const compare = (actual: unknown, op: string, expected: unknown) => {
  if (op === "includes") return Array.isArray(actual) && actual.includes(expected);
  if (op === "eq") return actual === expected;
  if (op === "ne") return actual !== expected;
  const a = Number(actual);
  const b = Number(expected);
  return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
};
/** Evaluate bindings against a model output (also used by golden visual checks). */
export function applyBindings(bindings: PackInput["bindings"], output: Record<string, unknown>) {
  return bindings
    .filter((b) => compare(output[b.when.output], b.when.op, b.when.value))
    .map((b) => ({ target: b.target, effect: b.effect }));
}

/** Every reason the pack is invalid; empty means scientific, structural and visual checks agree. */
export function packValidation(
  input: PackInput,
  ctx: {
    labModelRef: string | null;
    activity: { spec: any } | null;
    glb: { nodes: string[]; animations?: string[] } | null;
    visualReady: boolean;
  },
) {
  const errors: string[] = [];
  const model = MODEL_REGISTRY[input.modelRef];
  if (!model) return { errors: [`Mô hình ${input.modelRef} không nằm trong danh sách cho phép`], golden: [] };
  if (model.labId !== input.labId) errors.push(`mô hình ${input.modelRef} không thuộc phòng ${input.labId}`);
  if (ctx.labModelRef && ctx.labModelRef !== input.modelRef) errors.push(`phòng đang dùng ${ctx.labModelRef}, khác ${input.modelRef}`);
  if (input.modelRef === "buoyancy@1.0.0" && !input.template.buoyancy) errors.push("thiếu cấu hình buoyancy đã ghim");
  if (!ctx.activity) errors.push("thiếu hoạt động thực hành");
  const allowed = CHALLENGE_PARAMETERS[input.labId]?.params ?? {};
  for (const [name, range] of Object.entries(input.template.ranges)) {
    const spec = allowed[name] as any;
    if (!spec || spec.kind !== "number") errors.push(`tham số ${name} không được phép cho mô hình`);
    else if (range.min > range.max || range.min < spec.min || range.max > spec.max)
      errors.push(`khoảng ${name} phải nằm trong ${spec.min}–${spec.max} ${spec.unit}`);
    if (!input.template.units[name]) errors.push(`thiếu đơn vị cho ${name}`);
  }
  for (const t of input.challengeTemplates)
    for (const [name, range] of Object.entries(t.params)) {
      const outer = input.template.ranges[name];
      if (!outer || range.min < outer.min || range.max > outer.max || range.min > range.max)
        errors.push(`mẫu thử thách ${t.id}: ${name} ngoài khoảng của mẫu`);
    }
  // Semantic map and visual compatibility
  const ids = Object.keys(input.semanticMap);
  for (const required of model.requiredSemanticIds)
    if (!ids.includes(required)) errors.push(`bản đồ ngữ nghĩa thiếu nút bắt buộc "${required}"`);
  const nodeNames = Object.values(input.semanticMap);
  if (new Set(nodeNames).size !== nodeNames.length) errors.push("hai mã ngữ nghĩa trỏ cùng một nút");
  if (input.visualAssetVersionId) {
    if (!ctx.visualReady || !ctx.glb) errors.push("tệp 3D chưa sẵn sàng hoặc không phải GLB đã kiểm tra");
    else
      for (const [semantic, node] of Object.entries(input.semanticMap))
        if (!ctx.glb.nodes.includes(node)) errors.push(`nút "${node}" (${semantic}) không có trong GLB`);
  }
  for (const b of input.bindings) {
    if (!(b.when.output in model.outputs)) errors.push(`ràng buộc đọc đầu ra "${b.when.output}" không có trong mô hình`);
    if (!ids.includes(b.target)) errors.push(`ràng buộc trỏ tới mã ngữ nghĩa "${b.target}" không có trong bản đồ`);
    if (b.effect.type === "animation" && ctx.glb && !(ctx.glb.animations ?? []).includes(b.effect.value))
      errors.push(`hoạt ảnh "${b.effect.value}" không có trong GLB`);
  }
  // Golden cases on the server engine (before any visual QA)
  const golden = input.template.goldenCases.map((g) => {
    let output: any = null;
    let problem: string | null = null;
    try {
      output = model.simulate(g.state);
    } catch (error: any) {
      problem = "trạng thái không hợp lệ: " + String(error?.message ?? error).slice(0, 120);
    }
    // Observation-only models intentionally have no student verdict. For their
    // configuration golden cases, `passed` means only that the state was valid;
    // expectedOutputs verifies the observations (e.g. OPEN/CLOSED and ON/OFF).
    // Activity assessment is evaluated separately by the pinned rubric.
    const verdict = output
      ? model.observationOnly ? "passed" : normalize(output.verdict)
      : "invalid";
    const mismatches = output
      ? Object.entries(g.expectedOutputs).filter(([k, v]) =>
          typeof v === "number" ? Math.abs(Number(output[k]) - v) > Math.max(g.tolerance, Math.abs(v) * g.tolerance) : output[k] !== v,
        )
      : [];
    const ok = !problem && verdict === g.expectedVerdict && mismatches.length === 0;
    return {
      label: g.label,
      expectedVerdict: g.expectedVerdict,
      actualVerdict: verdict,
      mismatches: mismatches.map(([k]) => k),
      ok,
      problem,
    };
  });
  for (const g of golden) if (!g.ok) errors.push(`ca mẫu "${g.label}" không khớp kết quả máy chủ`);
  // Visual golden check: every binding must fire for at least one golden output, so no rule is dead or mistyped.
  const outputs = input.template.goldenCases.map((g) => {
    try {
      return model.simulate(g.state);
    } catch {
      return null;
    }
  });
  input.bindings.forEach((b, i) => {
    if (!outputs.some((o) => o && compare(o[b.when.output], b.when.op, b.when.value)))
      errors.push(`ràng buộc #${i + 1} (${b.when.output} ${b.when.op} ${b.when.value}) không kích hoạt ở ca mẫu nào`);
  });
  if ("subject" in input.reviews && input.reviews.subject.email === input.reviews.model.email)
    errors.push("người duyệt chuyên môn và người duyệt mô hình phải khác nhau");
  return { errors, golden };
}

export const activityDigest = (spec: unknown) => digestOf(spec);
