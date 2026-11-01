import { z } from "zod";

const holes = [-250, -200, -150, -100, -50, 0, 50, 100, 150, 200, 250] as const;
const presets = [
  { id: "C1", loadPositionMillimetres: -100, loadForceMilliNewtons: 1000, gaugePositionMillimetres: 200 },
  { id: "C2", loadPositionMillimetres: 150, loadForceMilliNewtons: 2000, gaugePositionMillimetres: -100 },
  { id: "C3", loadPositionMillimetres: -250, loadForceMilliNewtons: 500, gaugePositionMillimetres: 50 },
] as const;
const fixture = { id: "lever-bench-reference-v1", provenance: "technical_assumption", gravityMetresPerSecondSquared: 10, holes: [...holes], presets: presets.map(p => ({ ...p })) };
const freeze = (v: any): any => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
export const leverRegistry: Readonly<Record<string, unknown>> = freeze({ [fixture.id]: fixture });
const integer = z.number().finite().int();
const attachment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("WEIGHT"), positionMillimetres: integer, forceMilliNewtons: integer }).strict(),
  z.object({ kind: z.literal("GAUGE"), positionMillimetres: integer, forceMilliNewtons: integer }).strict(),
]);
const input = z.object({ fixtureId: z.string(), attachments: z.array(attachment) }).strict();
const presetSchema = z.object({ id: z.string(), loadPositionMillimetres: integer, loadForceMilliNewtons: integer, gaugePositionMillimetres: integer }).strict();
const fixtureSchema = z.object({ id: z.string(), provenance: z.string(), gravityMetresPerSecondSquared: integer, holes: z.array(integer), presets: z.array(presetSchema) }).strict();
type ErrorCode = "INVALID_SCHEMA" | "OUT_OF_RANGE" | "UNKNOWN_FIXTURE" | "INVALID_FIXTURE" | "INVALID_CONFIGURATION";
type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };
const fail = (code: ErrorCode) => ({ ok: false as const, code });
const safe = Number.isSafeInteger;
const atHole = (n: number) => holes.includes(n as typeof holes[number]);
export function validateLeverFixture(raw: unknown): Result<typeof fixture> {
  const parsed = fixtureSchema.safeParse(raw);
  if (!parsed.success) return fail("INVALID_FIXTURE");
  const f = parsed.data;
  if (f.id !== fixture.id || f.provenance !== fixture.provenance || f.gravityMetresPerSecondSquared !== 10 ||
    f.holes.length !== holes.length || f.holes.some((h, i) => h !== holes[i]) || f.presets.length !== presets.length) return fail("INVALID_FIXTURE");
  for (const [i, p] of f.presets.entries()) {
    const expected = presets[i];
    const numerator = p.loadForceMilliNewtons * Math.abs(p.loadPositionMillimetres);
    const denominator = Math.abs(p.gaugePositionMillimetres);
    if (p.id !== expected.id || p.loadPositionMillimetres !== expected.loadPositionMillimetres || p.loadForceMilliNewtons !== expected.loadForceMilliNewtons || p.gaugePositionMillimetres !== expected.gaugePositionMillimetres ||
      !atHole(p.loadPositionMillimetres) || !atHole(p.gaugePositionMillimetres) || p.loadPositionMillimetres * p.gaugePositionMillimetres >= 0 ||
      !safe(numerator) || denominator === 0 || numerator % denominator !== 0 || numerator / denominator > 5000 || numerator / denominator % 100 !== 0) return fail("INVALID_FIXTURE");
  }
  return { ok: true, value: f as typeof fixture };
}
export function evaluateLeverBenchWithRegistry(raw: unknown, registry: Readonly<Record<string, unknown>>) {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail("INVALID_SCHEMA");
  const { fixtureId, attachments } = parsed.data;
  if (attachments.length > 11 || attachments.some(a => !safe(a.positionMillimetres) || !atHole(a.positionMillimetres) || !safe(a.forceMilliNewtons) ||
    (a.kind === "WEIGHT" ? a.forceMilliNewtons < 500 || a.forceMilliNewtons > 5000 || a.forceMilliNewtons % 500 !== 0 : a.forceMilliNewtons < 0 || a.forceMilliNewtons > 5000 || a.forceMilliNewtons % 100 !== 0))) return fail("OUT_OF_RANGE");
  if (!Object.hasOwn(registry, fixtureId)) return fail("UNKNOWN_FIXTURE");
  if (!validateLeverFixture(registry[fixtureId]).ok) return fail("INVALID_FIXTURE");
  if (new Set(attachments.map(a => a.positionMillimetres)).size !== attachments.length || attachments.filter(a => a.kind === "GAUGE").length > 1) return fail("INVALID_CONFIGURATION");
  const rows = attachments.map(a => {
    const armMillimetres = Math.abs(a.positionMillimetres);
    const unsignedMomentMilliNewtonMillimetres = a.forceMilliNewtons * armMillimetres;
    return { ...a, armMillimetres, unsignedMomentMilliNewtonMillimetres, signedMomentMilliNewtonMillimetres: a.positionMillimetres < 0 ? unsignedMomentMilliNewtonMillimetres : a.positionMillimetres > 0 ? -unsignedMomentMilliNewtonMillimetres : 0 };
  });
  let ccw = 0, cw = 0;
  for (const row of rows) { if (!safe(row.unsignedMomentMilliNewtonMillimetres)) return fail("OUT_OF_RANGE"); if (row.signedMomentMilliNewtonMillimetres > 0) ccw += row.signedMomentMilliNewtonMillimetres; else cw -= row.signedMomentMilliNewtonMillimetres; }
  const net = ccw - cw;
  if (![ccw, cw, net].every(safe)) return fail("OUT_OF_RANGE");
  return { ok: true as const, value: { modelVersion: "1.0.0" as const, fixtureId: fixture.id, systemBoundary: "ideal_horizontal_rigid_bar" as const,
    assumptions: ["bar_mass_ignored", "pivot_friction_ignored", "perpendicular_downward_forces", "fulcrum_at_zero"] as const,
    attachments: rows, ccwMomentMilliNewtonMillimetres: ccw, cwMomentMilliNewtonMillimetres: cw, netMomentMilliNewtonMillimetres: net,
    balance: net === 0 ? "BALANCED" as const : "UNBALANCED" as const, displayState: net > 0 ? "TILT_LEFT" as const : net < 0 ? "TILT_RIGHT" as const : "LEVEL" as const } };
}
export const evaluateLeverBench = (raw: unknown) => evaluateLeverBenchWithRegistry(raw, leverRegistry);
const leverCase = z.object({ fulcrumMillimetres: integer, loadMillimetres: integer, effortMillimetres: integer }).strict();
export function classifyLeverCase(raw: unknown) {
  const parsed = leverCase.safeParse(raw);
  if (!parsed.success) return fail("INVALID_SCHEMA");
  const { fulcrumMillimetres: f, loadMillimetres: l, effortMillimetres: e } = parsed.data;
  if ([f, l, e].some(n => !safe(n) || !atHole(n))) return fail("OUT_OF_RANGE");
  if (new Set([f, l, e]).size !== 3) return fail("INVALID_CONFIGURATION");
  const loadArmMillimetres = Math.abs(l - f), effortArmMillimetres = Math.abs(e - f);
  const between = (a: number, b: number, c: number) => (a < b && b < c) || (c < b && b < a);
  return { ok: true as const, value: { loadArmMillimetres, effortArmMillimetres,
    geometry: between(l, f, e) ? "FULCRUM_BETWEEN" as const : between(f, l, e) ? "LOAD_BETWEEN" as const : "EFFORT_BETWEEN" as const,
    forceAdvantage: effortArmMillimetres > loadArmMillimetres ? "GAIN" as const : effortArmMillimetres === loadArmMillimetres ? "EQUAL" as const : "NO_GAIN" as const,
    changesForceDirection: between(l, f, e) } };
}
