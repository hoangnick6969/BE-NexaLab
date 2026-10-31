import { z } from "zod";
import { nextFl10Event, type Fl10Event } from "./fl-10-events";
import type { MassConservationOutput } from "./fl-10-types";

// Draft criterion check only. Event ordering, weights and release rubric remain undecided.
const schema = z.object({
  comparison: z.enum(["compare.increase", "compare.decrease", "compare.same"]),
  explanationAttempts: z.array(z.enum(["explain.rearrange", "explain.new_substance_heavier", "explain.solid_not_weighed"])).min(1).max(10),
  calculation: z.enum(["35-and-35", "35-and-34", "34-and-35"]),
  applicationV1: z.enum(["increase", "decrease", "same"]),
  applicationV2: z.enum(["increase", "decrease", "same"]),
  applicationV3: z.enum(["scope", "open_closed", "always_exact"]).optional(),
  reflectionNote: z.string().max(2000).optional(),
}).strict();

export function evaluateFl10DraftEvidence(
  raw: unknown,
  model: { beforeScaleMilligrams: number; afterScaleMilligrams: number },
  serverEvents: readonly Fl10Event[],
) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, code: "INVALID_EVIDENCE" as const };
  if (!Number.isSafeInteger(model.beforeScaleMilligrams) || !Number.isSafeInteger(model.afterScaleMilligrams))
    return { ok: false as const, code: "INVALID_MODEL_OUTPUT" as const };
  const historyCheck = nextFl10Event(serverEvents, { type: "READ_AFTER" });
  if (!historyCheck.ok && historyCheck.code === "INVALID_HISTORY")
    return { ok: false as const, code: "INVALID_SERVER_EVENTS" as const };
  const evidence = parsed.data;
  const expectedComparison = model.afterScaleMilligrams > model.beforeScaleMilligrams ? "compare.increase"
    : model.afterScaleMilligrams < model.beforeScaleMilligrams ? "compare.decrease" : "compare.same";
  return { ok: true as const, criteria: {
    C1: serverEvents.some((event) => event.type === "PREDICTED"),
    C2: serverEvents.some((event) => event.type === "READ_BEFORE") && serverEvents.some((event) => event.type === "READ_AFTER"),
    C3: evidence.comparison === expectedComparison,
    C4: evidence.explanationAttempts.at(-1) === "explain.rearrange",
    C5: evidence.calculation === "35-and-35",
    C6: evidence.applicationV1 === "decrease" && evidence.applicationV2 === "same",
  } };
}

export function evaluateFl10Activity(raw: unknown, model: MassConservationOutput, events: readonly Fl10Event[]) {
  if (events.length !== 4) throw new Error("FL-10 observation sequence is incomplete");
  const assessment = evaluateFl10DraftEvidence(raw, model, events);
  if (!assessment.ok) throw new Error(`FL-10 evidence ${assessment.code}`);
  const verdict = Object.values(assessment.criteria).every(Boolean) ? "passed" : "needs_practice";
  const explanationAttempts = (raw as { explanationAttempts: string[] }).explanationAttempts.length;
  return { result: { version: "1.0.0", scientificObservation: model,
    assessment: { criteria: assessment.criteria, prediction: events[0], explanationAttempts,
      passed: verdict === "passed" }, verdict }, verdict };
}
