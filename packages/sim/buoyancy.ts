import { z } from "zod";

export const buoyancyConfigSchema = z.object({
  fluidDensityKgM3: z.number().finite().positive().max(2000),
  gravity: z.number().finite().positive().max(20),
  volumeToleranceMl: z.number().finite().positive().max(2),
  forceToleranceN: z.number().finite().positive().max(0.1),
  specimens: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), massG: z.number().finite().positive(), volumeMl: z.number().finite().min(5).max(50) }).strict()).min(1).max(10),
  kit: z.record(z.unknown()),
}).strict().refine((value) => new Set(value.specimens.map((item) => item.id)).size === value.specimens.length, "Duplicate specimens");

/** SI units: kg/m³, m³, kg, N. Pure model shared by evaluator and pack tooling. */
export function simulateBuoyancy(input: { massKg: number; volumeM3: number; submergedVolumeM3: number; fluidDensityKgM3: number; gravity?: number }) {
  const { massKg, volumeM3, submergedVolumeM3, fluidDensityKgM3, gravity = 9.81 } = input;
  if (![massKg, volumeM3, submergedVolumeM3, fluidDensityKgM3, gravity].every(Number.isFinite) || massKg <= 0 || volumeM3 <= 0 || fluidDensityKgM3 <= 0 || gravity <= 0 || submergedVolumeM3 < 0 || submergedVolumeM3 > volumeM3) throw new Error("Invalid buoyancy parameters");
  const weightN = massKg * gravity;
  const buoyantForceN = fluidDensityKgM3 * gravity * submergedVolumeM3;
  return { weightN, buoyantForceN, springForceN: Math.max(0, weightN - buoyantForceN), overflowM3: submergedVolumeM3 };
}
