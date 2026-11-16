/**
 * fluid-pressure@1.0.0: integer model of the two FL-04 stations.
 * Depth probe: gauge pressure p = 10 Pa per mm of depth at each membrane, shown as a deformation level.
 * Pistons: compares the pressure under each piston by cross-multiplying, so equal pressures are exact.
 */
import { WATER_PASCALS_PER_MM, type DepthProbeSettings, type PistonSettings } from "./contracts";

export type MembraneId = "A" | "B" | "C";
export type MembraneReading = { depthMm: number; pascals: number; level: number };
export type DepthProbeState = { depthMm: number; positionMm: number };
export type DepthProbeResult =
  | { ok: true; membranes: Record<MembraneId, MembraneReading> }
  | { ok: false; code: "DEPTH_OUT_OF_RANGE" | "DEPTH_OFF_STEP" | "POSITION_NOT_ALLOWED" };

export type PistonState = { pan1: number; pan2: number };
export type PistonOutcome = "balanced" | "piston1_down" | "piston2_down";
export type PistonResult =
  | { ok: true; outcome: PistonOutcome; pascals: [number, number] }
  | { ok: false; code: "NEGATIVE_COUNT" | "PAN_FULL" | "WEIGHTS_EXHAUSTED" };

/** Deformation level 1..levels for any pressure above zero; the deepest allowed depth is the top level. */
export function deformationLevel(pascals: number, settings: DepthProbeSettings, levels: number) {
  if (pascals <= 0) return 0;
  const full = WATER_PASCALS_PER_MM * settings.maxDepthMm;
  return Math.min(levels, Math.ceil((pascals * levels) / full));
}

export function evaluateDepthProbe(settings: DepthProbeSettings, levels: number, state: DepthProbeState): DepthProbeResult {
  const { depthMm, positionMm } = state;
  if (!Number.isInteger(depthMm) || depthMm < 0 || depthMm > settings.maxDepthMm) return { ok: false, code: "DEPTH_OUT_OF_RANGE" };
  if (depthMm % settings.depthStepMm !== 0) return { ok: false, code: "DEPTH_OFF_STEP" };
  if (!settings.positionsMm.includes(positionMm)) return { ok: false, code: "POSITION_NOT_ALLOWED" };
  const reading = (depth: number): MembraneReading => {
    const pascals = WATER_PASCALS_PER_MM * depth;
    return { depthMm: depth, pascals, level: deformationLevel(pascals, settings, levels) };
  };
  // The horizontal position does not enter the model: same depth, same pressure.
  const side = reading(Math.max(0, depthMm - settings.sideHoleOffsetMm));
  return { ok: true, membranes: { A: side, B: { ...side }, C: reading(depthMm) } };
}

export function evaluatePistons(settings: PistonSettings, state: PistonState): PistonResult {
  const { pan1, pan2 } = state;
  if (!Number.isInteger(pan1) || !Number.isInteger(pan2) || pan1 < 0 || pan2 < 0) return { ok: false, code: "NEGATIVE_COUNT" };
  if (pan1 > settings.maxPerPan || pan2 > settings.maxPerPan) return { ok: false, code: "PAN_FULL" };
  if (pan1 + pan2 > settings.weightCount) return { ok: false, code: "WEIGHTS_EXHAUSTED" };
  const [area1, area2] = settings.areasMm2;
  const w = settings.weightMilliNewtons;
  const left = pan1 * w * area2;
  const right = pan2 * w * area1;
  const outcome: PistonOutcome = left === right ? "balanced" : left > right ? "piston1_down" : "piston2_down";
  // 1 mN/mm² = 1000 Pa; rounded for display only, the outcome above is exact.
  const pascals: [number, number] = [Math.round((pan1 * w * 1000) / area1), Math.round((pan2 * w * 1000) / area2)];
  return { ok: true, outcome, pascals };
}
