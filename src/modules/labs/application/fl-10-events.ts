import { z } from "zod";

const prediction = z.enum(["predict.increase", "predict.decrease", "predict.same"]);
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PREDICTED"), prediction, reason: z.string().max(2000).optional() }).strict(),
  z.object({ type: z.literal("READ_BEFORE") }).strict(),
  z.object({ type: z.literal("MIXED") }).strict(),
  z.object({ type: z.literal("READ_AFTER") }).strict(),
]);
export type Fl10Event = z.infer<typeof eventSchema>;
const order: Fl10Event["type"][] = ["PREDICTED", "READ_BEFORE", "MIXED", "READ_AFTER"];

/** Pure transition used before persisting an event under the LabRun lock. */
export function nextFl10Event(history: unknown, raw: unknown) {
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success || !Array.isArray(history)) return { ok: false as const, code: "INVALID_EVENT" as const };
  const events = history.map((item) => eventSchema.safeParse(item));
  if (events.some((item) => !item.success)) return { ok: false as const, code: "INVALID_HISTORY" as const };
  if (events.some((item, index) => item.data!.type !== order[index]))
    return { ok: false as const, code: "INVALID_HISTORY" as const };
  if (events.length >= order.length || parsed.data.type !== order[events.length])
    return { ok: false as const, code: "INVALID_ORDER" as const };
  return { ok: true as const, sequence: events.length + 1, event: parsed.data };
}

/** No future observation is disclosed before its server event has been recorded. */
export function fl10VisibleReadings(history: readonly Fl10Event[], model: { beforeScaleMilligrams: number; afterScaleMilligrams: number }) {
  if (!Number.isSafeInteger(model.beforeScaleMilligrams) || !Number.isSafeInteger(model.afterScaleMilligrams))
    throw new Error("Invalid pinned model output");
  return {
    beforeScaleMilligrams: history.some((event) => event.type === "READ_BEFORE") ? model.beforeScaleMilligrams : null,
    afterScaleMilligrams: history.some((event) => event.type === "READ_AFTER") ? model.afterScaleMilligrams : null,
  };
}
