/**
 * mechanical-energy@1.0.0: integer model of the two FL-24 stations (g, mm, mN, ms, mJ, mW).
 * Pendulum: Wt = P·h = 10·m·h µJ = m·h/100 mJ, W = Wt(h₀) stays constant, Wđ = W − Wt (no friction).
 * Hoist: F = 10·m mN along the motion, A = F·s/1000 mJ, P = A·1000/t mW (rounded for display only).
 */
import { PENDULUM_POSITIONS, WEIGHT_MILLINEWTONS_PER_GRAM, type HoistSettings, type PendulumPosition, type PendulumSettings } from "./contracts";

export type PendulumState = { massG: number; dropHeightMm: number; position: PendulumPosition };
export type PendulumReading = { position: PendulumPosition; heightMm: number; potentialMj: number; kineticMj: number; mechanicalMj: number };
export type PendulumResult =
  | ({ ok: true } & PendulumReading)
  | { ok: false; code: "MASS_NOT_ALLOWED" | "HEIGHT_OUT_OF_RANGE" | "HEIGHT_OFF_STEP" | "POSITION_UNKNOWN" };

export type HoistState = { massG: number; distanceMm: number; motorId: string };
export type WorkPower = { forceMilliNewtons: number; distanceMm: number; durationMs: number; workMj: number; powerMw: number };
type WorkPowerError = "FORCE_NOT_POSITIVE" | "DISTANCE_NOT_POSITIVE" | "DURATION_NOT_POSITIVE";
export type WorkPowerResult = ({ ok: true } & WorkPower) | { ok: false; code: WorkPowerError };
export type HoistResult =
  | ({ ok: true; massG: number; motorId: string } & WorkPower)
  | { ok: false; code: "MASS_NOT_ALLOWED" | "DISTANCE_OUT_OF_RANGE" | "DISTANCE_OFF_STEP" | "MOTOR_NOT_ALLOWED" | WorkPowerError };

/** Weight of a mass in mN (P = 10·m). */
export const weightMilliNewtons = (massG: number) => WEIGHT_MILLINEWTONS_PER_GRAM * massG;

/** Potential energy near the ground in mJ: P·h = 10·m (mN) · h (mm) µJ. */
export const potentialEnergyMj = (massG: number, heightMm: number) => (weightMilliNewtons(massG) * heightMm) / 1000;

/** Height of the bob at a checkpoint; the halfway checkpoints sit at h₀/2. */
export function pendulumHeightMm(dropHeightMm: number, position: PendulumPosition) {
  if (position === "release" || position === "far-high") return dropHeightMm;
  if (position === "lowest") return 0;
  return dropHeightMm / 2;
}

export function evaluatePendulum(settings: PendulumSettings, state: PendulumState): PendulumResult {
  const { massG, dropHeightMm, position } = state;
  if (!settings.massesG.includes(massG)) return { ok: false, code: "MASS_NOT_ALLOWED" };
  if (!Number.isInteger(dropHeightMm) || dropHeightMm < 0 || dropHeightMm > settings.maxDropHeightMm) return { ok: false, code: "HEIGHT_OUT_OF_RANGE" };
  if (dropHeightMm % settings.heightStepMm !== 0) return { ok: false, code: "HEIGHT_OFF_STEP" };
  if (!PENDULUM_POSITIONS.includes(position)) return { ok: false, code: "POSITION_UNKNOWN" };
  const heightMm = pendulumHeightMm(dropHeightMm, position);
  const mechanicalMj = potentialEnergyMj(massG, dropHeightMm);
  const potentialMj = potentialEnergyMj(massG, heightMm);
  return { ok: true, position, heightMm, potentialMj, kineticMj: mechanicalMj - potentialMj, mechanicalMj };
}

/** Readings at all five checkpoints of one swing (for the energy bars and the notebook). */
export function pendulumSwing(settings: PendulumSettings, massG: number, dropHeightMm: number) {
  return PENDULUM_POSITIONS.map((position) => evaluatePendulum(settings, { massG, dropHeightMm, position }));
}

/** A = F·s and P = A/t for a force along the motion. */
export function workAndPower(forceMilliNewtons: number, distanceMm: number, durationMs: number): WorkPowerResult {
  if (!(forceMilliNewtons > 0)) return { ok: false, code: "FORCE_NOT_POSITIVE" };
  if (!(distanceMm > 0)) return { ok: false, code: "DISTANCE_NOT_POSITIVE" };
  if (!(durationMs > 0)) return { ok: false, code: "DURATION_NOT_POSITIVE" };
  const workMj = (forceMilliNewtons * distanceMm) / 1000;
  return { ok: true, forceMilliNewtons, distanceMm, durationMs, workMj, powerMw: Math.round((workMj * 1000) / durationMs) };
}

/** Pull time of a motor over a distance, in ms. */
export const hoistDurationMs = (distanceMm: number, speedMmPerS: number) => Math.round((distanceMm * 1000) / speedMmPerS);

export function evaluateHoist(settings: HoistSettings, state: HoistState): HoistResult {
  const { massG, distanceMm, motorId } = state;
  if (!settings.massesG.includes(massG)) return { ok: false, code: "MASS_NOT_ALLOWED" };
  if (!Number.isInteger(distanceMm) || distanceMm < settings.minDistanceMm || distanceMm > settings.maxDistanceMm) return { ok: false, code: "DISTANCE_OUT_OF_RANGE" };
  if ((distanceMm - settings.minDistanceMm) % settings.distanceStepMm !== 0) return { ok: false, code: "DISTANCE_OFF_STEP" };
  const motor = settings.motors.find((item) => item.id === motorId);
  if (!motor) return { ok: false, code: "MOTOR_NOT_ALLOWED" };
  const result = workAndPower(weightMilliNewtons(massG), distanceMm, hoistDurationMs(distanceMm, motor.speedMmPerS));
  return result.ok ? { ...result, massG, motorId } : result;
}

/** Which of two lifts is more powerful, by cross-multiplying A₁·t₂ and A₂·t₁ (exact, no rounding). */
export function comparePower(a: Pick<WorkPower, "workMj" | "durationMs">, b: Pick<WorkPower, "workMj" | "durationMs">): "first" | "second" | "equal" {
  const left = a.workMj * b.durationMs;
  const right = b.workMj * a.durationMs;
  return left === right ? "equal" : left > right ? "first" : "second";
}
