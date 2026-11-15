import { z } from "zod";
export { evaluateMassConservation } from "./mass-conservation";
export { simulateBuoyancy } from "./buoyancy";
export { evaluateLeverBench, classifyLeverCase } from "./lever-bench";
export { evaluateThermalBench } from "./thermal-bench";
export * from "./gene-expression";
export { ecologyTolerance, ecologyToleranceSchema, ECOLOGY_SPECIES, ECOLOGY_SITES, ECOLOGY_POPULATIONS, ECOLOGY_AGE_SAMPLES, fraction, pyramidFor } from "./ecology-tolerance";
export type { EcologyToleranceState, Fraction } from "./ecology-tolerance";
export { foodWeb, foodWebSchema, foodWebChains, FOOD_WEB_SPECIES, FOOD_WEB_EDGES, FOOD_WEB_CAUSES, FOOD_WEB_ENERGY_CHAIN } from "./food-web";
export type { FoodWebState, FoodWebSpeciesId, FoodWebRole, FoodWebCauseId } from "./food-web";
export { mendelCross, mendelCrossSchema, normaliseGenotype, gametesOf, reduceRatio, MENDEL_VERSION, MENDEL_REVIEW_STATUS } from "./mendel-cross";
export type { MendelCrossState } from "./mendel-cross";
export { fl26MendelConfigSchema, parseFl26MendelConfig } from "./mendel-config";
export type { Fl26MendelConfig } from "./mendel-config";
export const VERSION = "1.0.0";
const part = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(["battery", "resistor", "led", "switch"]),
  value: z.number().finite().min(0).max(100000).optional(),
  closed: z.boolean().optional(),
});
export const circuitSchema = z.object({
  nodes: z.array(part).min(1).max(24),
  edges: z.array(z.object({ source: z.string(), target: z.string() })).max(48),
});
export type CircuitState = z.infer<typeof circuitSchema>;
export function circuit(raw: unknown) {
  const state = circuitSchema.parse(raw);
  const nodes = state.nodes;
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length)
    throw new Error("Mã linh kiện bị trùng");
  const battery = nodes.filter((n) => n.type === "battery");
  if (battery.length !== 1) throw new Error("MVP yêu cầu đúng một nguồn điện");
  const voltage = battery[0].value ?? 9;
  if (voltage < 1 || voltage > 24) throw new Error("Điện áp phải từ 1–24 V");
  const adjacency = new Map(nodes.map((n) => [n.id, [] as string[]]));
  const unique = new Set<string>();
  for (const e of state.edges) {
    if (
      !adjacency.has(e.source) ||
      !adjacency.has(e.target) ||
      e.source === e.target
    )
      throw new Error("Dây nối không hợp lệ");
    const key = [e.source, e.target].sort().join("|");
    if (unique.has(key)) throw new Error("Dây nối bị trùng");
    unique.add(key);
    adjacency.get(e.source)!.push(e.target);
    adjacency.get(e.target)!.push(e.target === e.source ? e.target : e.source);
  }
  const base = {
    version: VERSION,
    voltage,
    maxCurrentMa: 20,
    minimumResistance: Math.ceil(Math.max(0, voltage - 2) / 0.02),
  };
  const fail = (status: string) => ({
    ...base,
    current: 0,
    currentMa: 0,
    resistance: 0,
    ledState: "OFF",
    status,
    verdict: "not_passed",
    branches: [] as number[],
  });
  // Each path from one battery terminal (source edge) back to battery is a series branch.
  // Node canvas uses undirected loops: enumerate simple cycles through the sole source.
  const source = battery[0].id;
  const paths: string[][] = [];
  let visits = 0;
  const visit = (at: string, path: string[]) => {
    if (++visits > 10000)
      throw new Error(
        "Mạch quá phức tạp; hãy dùng nhánh nối tiếp/song song độc lập",
      );
    for (const next of adjacency.get(at)!) {
      if (next === source && path.length >= 3) {
        if (path[1] < path[path.length - 1]) paths.push([...path]);
        continue;
      }
      if (path.includes(next)) continue;
      if (paths.length > 16) throw new Error("Tối đa 16 nhánh");
      visit(next, [...path, next]);
    }
  };
  visit(source, [source]);
  if (!paths.length) return fail("OPEN_CIRCUIT");
  const active = paths.filter(
    (p) =>
      !p.some((id) => {
        const n = nodes.find((n) => n.id === id)!;
        return n.type === "switch" && !n.closed;
      }),
  );
  if (!active.length) return fail("SWITCH_OPEN");
  // Disjoint branches are supported; bridge/shared non-source nodes are rejected.
  const used = new Set<string>();
  for (const p of active)
    for (const id of p.slice(1)) {
      if (used.has(id))
        throw new Error(
          "Chỉ hỗ trợ nhánh nối tiếp/song song độc lập, không hỗ trợ mạch cầu",
        );
      used.add(id);
    }
  let hasLed = false,
    overload = false,
    anyOn = false;
  const branches = active.map((p) => {
    const parts = p.map((id) => nodes.find((n) => n.id === id)!);
    const resistance = parts
      .filter((n) => n.type === "resistor")
      .reduce((s, n) => s + (n.value ?? 330), 0);
    const leds = parts.filter((n) => n.type === "led").length;
    hasLed ||= leds > 0;
    const current =
      resistance === 0 ? null : Math.max(0, voltage - 2 * leds) / resistance;
    if (current === null || (leds > 0 && current > 0.02 + 1e-12))
      overload = true;
    if (
      leds > 0 &&
      current !== null &&
      current >= 0.001 &&
      current <= 0.02 + 1e-12
    )
      anyOn = true;
    return { resistance, current, leds };
  });
  const current = branches.some((b) => b.current === null)
    ? null
    : branches.reduce((s, b) => s + b.current!, 0);
  const status = overload
    ? "LED_OVERLOAD"
    : !hasLed
      ? "NO_LED"
      : anyOn
        ? "SAFE"
        : "LOW_CURRENT";
  return {
    ...base,
    current,
    currentMa: current === null ? null : Math.round(current * 1000000) / 1000,
    resistance: branches.length === 1 ? branches[0].resistance : null,
    ledState: overload ? "OVERLOAD" : anyOn ? "ON" : "OFF",
    status,
    verdict: overload ? "partial" : anyOn ? "passed" : "not_passed",
    branches,
  };
}

/** Ideal continuity model for the versioned CLOSED/OPEN bulb activity. */
export const circuitBulbSchema = z.object({
  nodes: z.array(z.object({
    id: z.string().min(1).max(60),
    type: z.enum(["battery", "bulb", "switch"]),
    closed: z.boolean().optional(),
  }).strict()).length(3),
  edges: z.array(z.object({ source: z.string(), target: z.string() }).strict()).length(3),
}).strict();

export function circuitBulb(raw: unknown) {
  const state = circuitBulbSchema.parse(raw);
  const byType = Object.fromEntries(state.nodes.map((node) => [node.type, node]));
  if (new Set(state.nodes.map((node) => node.id)).size !== 3 ||
      !byType.battery || !byType.bulb || !byType.switch ||
      typeof byType.switch.closed !== "boolean" ||
      state.nodes.some((node) => node.type !== "switch" && node.closed !== undefined))
    throw new Error("Cần đúng một nguồn, một bóng đèn và một công tắc có trạng thái");

  const ids = state.nodes.map((node) => node.id);
  const expected = new Set(ids.map((id, index) => [id, ids[(index + 1) % ids.length]].sort().join("|")));
  const actual = new Set(state.edges.map((edge) => [edge.source, edge.target].sort().join("|")));
  if (actual.size !== 3 || [...actual].some((edge) => !expected.has(edge)))
    throw new Error("Mạch phải là một vòng kín gồm nguồn, bóng đèn và công tắc");

  return {
    version: "1.0.0",
    circuitPath: byType.switch.closed ? "CLOSED" : "OPEN",
    bulbState: byType.switch.closed ? "ON" : "OFF",
  };
}

// FL-25 em-induction@1.0.0: qualitative induction only. No EMF, magnitude,
// speed, turn count or field strength is modelled. D1/D2 are the two current
// directions of the fixed coil winding; renderers map them to needle sides.
export const emInductionSchema = z.discriminatedUnion("setup", [
  z.object({
    setup: z.literal("magnet-coil"),
    circuit: z.enum(["CLOSED", "OPEN"]),
    poleFacingCoil: z.enum(["N", "S"]),
    magnetPosition: z.enum(["OUTSIDE", "INSIDE"]),
    motion: z.enum(["STILL", "TOWARD", "AWAY"]),
  }).strict(),
  z.object({
    setup: z.literal("generator"),
    circuit: z.enum(["CLOSED", "OPEN"]),
    rotation: z.enum(["STILL", "CW", "CCW"]),
    turns: z.union([z.literal(0), z.literal(1)]),
  }).strict(),
]);
export type EmInductionState = z.infer<typeof emInductionSchema>;
export type EmDirection = "D1" | "D2" | "NONE";

/** Phase samples at 0°, 45°, …, 315° of one turn; current follows the sign of sin θ for CW. */
const GENERATOR_CW: EmDirection[] = ["NONE", "D1", "D1", "D1", "NONE", "D2", "D2", "D2"];
const reverse = (direction: EmDirection): EmDirection => direction === "D1" ? "D2" : direction === "D2" ? "D1" : "NONE";

export function emInduction(raw: unknown) {
  const state = emInductionSchema.parse(raw);
  if (state.setup === "magnet-coil") {
    if ((state.motion === "TOWARD" && state.magnetPosition !== "INSIDE") ||
        (state.motion === "AWAY" && state.magnetPosition !== "OUTSIDE"))
      throw new Error("Vị trí nam châm không khớp chiều chuyển động");
    const fieldThroughCoil = state.motion === "TOWARD" ? "INCREASING" : state.motion === "AWAY" ? "DECREASING" : "UNCHANGED";
    const present = state.circuit === "CLOSED" && fieldThroughCoil !== "UNCHANGED";
    // Reversing either the pole or the motion reverses the current.
    const northDirection: EmDirection = state.motion === "TOWARD" ? "D1" : "D2";
    return {
      version: "1.0.0",
      setup: "magnet-coil" as const,
      fieldThroughCoil,
      inducedCurrent: present ? "PRESENT" : "ABSENT",
      direction: present ? (state.poleFacingCoil === "N" ? northDirection : reverse(northDirection)) : "NONE" as EmDirection,
    };
  }
  if ((state.rotation === "STILL") !== (state.turns === 0))
    throw new Error("Số vòng quay không khớp trạng thái quay");
  const present = state.circuit === "CLOSED" && state.rotation !== "STILL";
  return {
    version: "1.0.0",
    setup: "generator" as const,
    inducedCurrent: present ? "PRESENT" : "ABSENT",
    currentKind: present ? "ALTERNATING" : "NONE",
    reversalsPerTurn: present ? 2 : 0,
    phaseDirections: present
      ? state.rotation === "CW" ? [...GENERATOR_CW] : GENERATOR_CW.map(reverse)
      : GENERATOR_CW.map((): EmDirection => "NONE"),
  };
}

export const reactions = [
  {
    id: "mg-hcl",
    equation: "Mg + 2HCl → MgCl₂ + H₂",
    a: "Mg",
    b: "HCl",
    ratioA: 1,
    ratioB: 2,
    phenomenon: "Sủi bọt khí H₂",
    product: "H₂",
    color: "#e1eef4",
  },
  {
    id: "caco3-hcl",
    equation: "CaCO₃ + 2HCl → CaCl₂ + CO₂ + H₂O",
    a: "CaCO₃",
    b: "HCl",
    ratioA: 1,
    ratioB: 2,
    phenomenon: "Sủi bọt khí CO₂",
    product: "CO₂",
    color: "#e1eef4",
  },
  {
    id: "naoh-hcl",
    equation: "NaOH + HCl → NaCl + H₂O",
    a: "NaOH",
    b: "HCl",
    ratioA: 1,
    ratioB: 1,
    phenomenon: "Trung hòa; chỉ thị thay đổi theo chất dư",
    product: "NaCl",
    color: "#ead2ed",
  },
  {
    id: "cuso4-naoh",
    equation: "CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄",
    a: "CuSO₄",
    b: "NaOH",
    ratioA: 1,
    ratioB: 2,
    phenomenon: "Kết tủa xanh Cu(OH)₂",
    product: "Cu(OH)₂",
    color: "#37a6e8",
  },
  {
    id: "nacl-agno3",
    equation: "NaCl + AgNO₃ → AgCl↓ + NaNO₃",
    a: "NaCl",
    b: "AgNO₃",
    ratioA: 1,
    ratioB: 1,
    phenomenon: "Kết tủa trắng AgCl",
    product: "AgCl",
    color: "#f5f5f1",
  },
  {
    id: "fe-cuso4",
    equation: "Fe + CuSO₄ → FeSO₄ + Cu",
    a: "Fe",
    b: "CuSO₄",
    ratioA: 1,
    ratioB: 1,
    phenomenon: "Màu xanh nhạt dần, kim loại đỏ đồng xuất hiện",
    product: "Cu",
    color: "#bf7955",
  },
] as const;
export const chemistrySchema = z.object({
  reactionId: z.string().optional(),
  molesA: z.number().finite().min(0).max(2).optional(),
  molesB: z.number().finite().min(0).max(2).optional(),
  samples: z.record(z.enum(["acid", "neutral", "base"])).optional(),
});
export function chemistry(raw: unknown) {
  const s = chemistrySchema.parse(raw);
  if (s.samples) {
    const expected = { jar1: "acid", jar2: "neutral", jar3: "base" } as const;
    const samples = Object.entries(expected).map(([id, expectedType]) => ({ id, type: s.samples?.[id] ?? null, correct: s.samples?.[id] === expectedType }));
    const complete = samples.every((sample) => sample.type !== null);
    const passed = complete && samples.every((sample) => sample.correct);
    return {
      version: VERSION,
      experiment: "ph",
      samples,
      verdict: passed ? "passed" : complete ? "not_passed" : "partial",
      phenomenon: passed ? "Đã xác định đúng: lọ 1 là axit, lọ 2 trung tính, lọ 3 là bazơ." : "Hãy xác định đúng tính chất của cả ba lọ mất nhãn.",
    };
  }
  if (!s.reactionId || s.molesA == null || s.molesB == null) throw new Error("Thiếu dữ liệu thí nghiệm");
  const r = reactions.find((r) => r.id === s.reactionId);
  if (!r) throw new Error("Phản ứng chưa được hỗ trợ");
  const extent = Math.min(s.molesA / r.ratioA, s.molesB / r.ratioB);
  const remainingA = Math.max(0, s.molesA - extent * r.ratioA);
  const remainingB = Math.max(0, s.molesB - extent * r.ratioB);
  return {
    version: VERSION,
    ...r,
    extent,
    remainingA,
    remainingB,
    limiting:
      Math.abs(s.molesA / r.ratioA - s.molesB / r.ratioB) < 1e-9
        ? "balanced"
        : s.molesA / r.ratioA < s.molesB / r.ratioB
          ? r.a
          : r.b,
    verdict:
      extent <= 0
        ? "not_passed"
        : remainingA < 1e-9 && remainingB < 1e-9
          ? "passed"
          : "partial",
  };
}
export const eyeParts = [
  {
    id: "cornea",
    name: "Giác mạc",
    description: "Lớp trong suốt phía trước, khúc xạ ánh sáng đi vào mắt.",
  },
  {
    id: "aqueous",
    name: "Thủy dịch",
    description: "Dịch trong suốt giữa giác mạc và thể thủy tinh.",
  },
  {
    id: "pupil",
    name: "Đồng tử",
    description: "Lỗ ở giữa mống mắt cho ánh sáng đi qua.",
  },
  {
    id: "lens",
    name: "Thể thủy tinh",
    description: "Điều tiết để hội tụ ánh sáng lên võng mạc.",
  },
  {
    id: "vitreous",
    name: "Dịch kính",
    description: "Khối gel trong suốt duy trì hình dạng nhãn cầu.",
  },
  {
    id: "retina",
    name: "Võng mạc",
    description: "Lớp cảm thụ ánh sáng, chuyển thành tín hiệu thần kinh.",
  },
  {
    id: "nerve",
    name: "Dây thần kinh thị giác",
    description: "Dẫn truyền tín hiệu từ võng mạc đến não.",
  },
  {
    id: "sclera",
    name: "Củng mạc",
    description: "Lớp vỏ bảo vệ và duy trì hình dạng mắt.",
  },
];
export function eye(raw: unknown) {
  const s = z.object({ answers: z.record(z.string().max(100)) }).parse(raw);
  const normalize = (v: string) =>
    v.trim().toLocaleLowerCase("vi").normalize("NFC");
  const correct = eyeParts
    .filter((p) => normalize(s.answers[p.id] ?? "") === normalize(p.name))
    .map((p) => p.id);
  const score = Math.round((correct.length / eyeParts.length) * 100);
  return {
    version: VERSION,
    correct,
    score,
    verdict: score === 100 ? "passed" : score > 0 ? "partial" : "not_passed",
  };
}
/**
 * FL-03 density bench (KHTN 8 Bài 13–14): reviewed virtual specimens, ideal
 * instruments and the readings a correct learner would take. Observation only:
 * it has no learner verdict; the activity rubric compares learner readings.
 * Values are PROPOSED_UNAPPROVED until a reviewer signs the release digest, and
 * must agree with the frontend K3 sample config. Dimensions are mm, volumes
 * cm³ (1 mL = 1 cm³), masses g, densities g/cm³.
 */
export const DENSITY_INSTRUMENTS = {
  balance: { capacityG: 500, resolutionG: 0.1 },
  ruler: { lengthMm: 300, resolutionMm: 1 },
  cylinder: { capacityMl: 100, resolutionMl: 1 },
  cupEmptyMassG: 48.6,
} as const;
export const DENSITY_TOLERANCES = {
  /** Readings accepted within this many instrument divisions. */
  readingDivisions: 1,
  /** Learner calculation accepted within this relative error of their own m/V. */
  relativeCalculation: 0.01,
  /** …but never tighter than this absolute rounding allowance (g/cm³). */
  absoluteCalculationGcm3: 0.005,
  /** Observational feedback band around the reference density. */
  referenceBand: 0.05,
} as const;
export const WATER_DENSITY_GCM3 = 1;
type BoxSpecimen = { shape: "box"; id: string; material: string; referenceGcm3: number; sizeMm: readonly [number, number, number]; massG: number };
type PebbleSpecimen = { shape: "irregular"; id: string; material: string; referenceGcm3: number; volumeMl: number; massG: number };
export const DENSITY_SPECIMENS = {
  "iron-1v": { shape: "box", id: "iron-1v", material: "iron", referenceGcm3: 7.8, sizeMm: [20, 20, 25], massG: 78 },
  "iron-2v": { shape: "box", id: "iron-2v", material: "iron", referenceGcm3: 7.8, sizeMm: [20, 20, 50], massG: 156 },
  "iron-3v": { shape: "box", id: "iron-3v", material: "iron", referenceGcm3: 7.8, sizeMm: [20, 30, 50], massG: 234 },
  "aluminium-1v": { shape: "box", id: "aluminium-1v", material: "aluminium", referenceGcm3: 2.7, sizeMm: [20, 20, 25], massG: 27 },
  "copper-1v": { shape: "box", id: "copper-1v", material: "copper", referenceGcm3: 8.9, sizeMm: [20, 20, 25], massG: 89 },
  "cast-iron-block": { shape: "box", id: "cast-iron-block", material: "cast-iron", referenceGcm3: 7, sizeMm: [20, 30, 50], massG: 210 },
  "wood-block-a": { shape: "box", id: "wood-block-a", material: "wood", referenceGcm3: 0.6, sizeMm: [100, 60, 40], massG: 144 },
  "wood-block-b": { shape: "box", id: "wood-block-b", material: "wood", referenceGcm3: 0.6, sizeMm: [80, 50, 30], massG: 72 },
  "pebble-a": { shape: "irregular", id: "pebble-a", material: "pebble", referenceGcm3: 2.6, volumeMl: 12, massG: 31.2 },
  "pebble-b": { shape: "irregular", id: "pebble-b", material: "pebble", referenceGcm3: 2.6, volumeMl: 9, massG: 23.4 },
} as const satisfies Record<string, BoxSpecimen | PebbleSpecimen>;
export const DENSITY_EXPLORE_IDS = ["iron-1v", "iron-2v", "iron-3v", "aluminium-1v", "copper-1v"] as const;
export const DENSITY_BLOCK_IDS = ["wood-block-a", "wood-block-b"] as const;
export const DENSITY_PEBBLE_IDS = ["pebble-a", "pebble-b"] as const;

const round = (value: number, places: number) => Number(value.toFixed(places));
const boxVolumeCm3 = (sizeMm: readonly [number, number, number]) => round((sizeMm[0] * sizeMm[1] * sizeMm[2]) / 1000, 6);

/** Learner-chosen apparatus set-up: which specimens, how much water. */
export const densityBenchSchema = z.object({
  blockId: z.enum(DENSITY_BLOCK_IDS),
  pebbleId: z.enum(DENSITY_PEBBLE_IDS),
  pouredMl: z.number().int().min(10).max(90),
  pebbleInitialMl: z.number().int().min(20).max(80),
}).strict();

export function densityBench(raw: unknown) {
  const state = densityBenchSchema.parse(raw);
  const block = DENSITY_SPECIMENS[state.blockId];
  const pebble = DENSITY_SPECIMENS[state.pebbleId];
  const blockVolume = boxVolumeCm3(block.sizeMm);
  const waterMassG = round(state.pouredMl * WATER_DENSITY_GCM3, 1);
  const v2Ml = state.pebbleInitialMl + pebble.volumeMl;
  if (v2Ml > DENSITY_INSTRUMENTS.cylinder.capacityMl) throw new Error("Mực nước sau khi thả vật vượt dung tích ống đong");
  return {
    version: "1.0.0",
    instruments: DENSITY_INSTRUMENTS,
    tolerances: DENSITY_TOLERANCES,
    explore: DENSITY_EXPLORE_IDS.map((id) => {
      const specimen = DENSITY_SPECIMENS[id];
      const volumeCm3 = boxVolumeCm3(specimen.sizeMm);
      return { specimenId: id, massG: specimen.massG, volumeCm3, densityGcm3: round(specimen.massG / volumeCm3, 4) };
    }),
    block: {
      specimenId: block.id, edgesMm: [...block.sizeMm], volumeCm3: blockVolume, massG: block.massG,
      densityGcm3: round(block.massG / blockVolume, 4), referenceGcm3: block.referenceGcm3,
    },
    water: {
      pouredMl: state.pouredMl, cupMassG: DENSITY_INSTRUMENTS.cupEmptyMassG, waterMassG,
      cupPlusWaterG: round(DENSITY_INSTRUMENTS.cupEmptyMassG + waterMassG, 1),
      densityGcm3: round(waterMassG / state.pouredMl, 4), referenceGcm3: WATER_DENSITY_GCM3,
    },
    pebble: {
      specimenId: pebble.id, massG: pebble.massG, v1Ml: state.pebbleInitialMl, v2Ml,
      volumeCm3: pebble.volumeMl, densityGcm3: round(pebble.massG / pebble.volumeMl, 4), referenceGcm3: pebble.referenceGcm3,
    },
  };
}

export function simulate(labId: string, state: unknown) {
  if (labId === "circuit") return circuit(state);
  if (labId === "chemistry") return chemistry(state);
  if (labId === "eye") return eye(state);
  throw new Error("Lab không tồn tại");
}
export { dioramaExploreSchema, fl20ExploreSchema, fl21ExploreSchema, fl27ExploreSchema, fl16ExploreSchema, fl21RemovalResult, fl20ToleranceResult, fl27VariantResult, fl16PowerResult, FL16_SCENARIOS } from "./explore-kits";
export type { DioramaExploreConfig, MolecularExploreConfig, AnatomyExploreConfig } from "./explore-kits";
