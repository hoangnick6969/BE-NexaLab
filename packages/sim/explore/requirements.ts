/**
 * Class Explore requirements shared by every bench (P0 C3.3): what a student must hand in, and the integer unit each
 * measurement is stored in. A bench declares which measurements it supports; the server checks the range from this table.
 */
import { z } from "zod";

/** Integer units a measurement is handed in as. The range is checked on submit. */
export const MEASURE_UNITS = {
  /** pH in tenths: 7,0 is 70. */
  tenthsPh: { min: 0, max: 140 },
  /** Moment in thousandths of a newton metre: 0,150 N·m is 150. */
  milliNewtonMetres: { min: 0, max: 100_000 },
} as const;
export type MeasureUnit = keyof typeof MEASURE_UNITS;

/** Measurement → its unit. One unit per measurement keeps a requirement unambiguous. */
export const MEASUREMENT_UNIT = {
  ph_meter: "tenthsPh",
  moment: "milliNewtonMetres",
} as const satisfies Record<string, MeasureUnit>;
export type RequirementMeasurement = keyof typeof MEASUREMENT_UNIT;

const identifier = z.string().trim().min(1).max(100);
const measurements = Object.keys(MEASUREMENT_UNIT) as [RequirementMeasurement, ...RequirementMeasurement[]];
const units = Object.keys(MEASURE_UNITS) as [MeasureUnit, ...MeasureUnit[]];

export const exploreRequirementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("measure"), itemId: identifier, measurement: z.enum(measurements), unit: z.enum(units) }).strict(),
  z.object({ kind: z.literal("explain") }).strict(),
]).superRefine((item, ctx) => {
  if (item.kind === "measure" && MEASUREMENT_UNIT[item.measurement] !== item.unit) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "unit does not match the measurement", path: ["unit"] });
});
export type ExploreRequirement = z.infer<typeof exploreRequirementSchema>;
export type MeasureRequirement = Extract<ExploreRequirement, { kind: "measure" }>;

/** Is `value` a valid hand-in for this requirement's unit? */
export const measureInRange = (unit: MeasureUnit, value: number) =>
  Number.isInteger(value) && value >= MEASURE_UNITS[unit].min && value <= MEASURE_UNITS[unit].max;
