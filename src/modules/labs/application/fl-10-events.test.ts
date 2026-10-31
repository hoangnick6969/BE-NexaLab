import { describe, expect, it } from "vitest";
import { fl10VisibleReadings, nextFl10Event, type Fl10Event } from "./fl-10-events";

const prediction: Fl10Event = { type: "PREDICTED", prediction: "predict.decrease" };
const before: Fl10Event = { type: "READ_BEFORE" };
const mixed: Fl10Event = { type: "MIXED" };
const after: Fl10Event = { type: "READ_AFTER" };
const model = { beforeScaleMilligrams: 435000, afterScaleMilligrams: 435000 };

describe("FL-10 server event sequence", () => {
  it("requires prediction before either reading and reveals only recorded readings", () => {
    expect(nextFl10Event([], before)).toEqual({ ok: false, code: "INVALID_ORDER" });
    expect(nextFl10Event([], prediction)).toMatchObject({ ok: true, sequence: 1 });
    expect(fl10VisibleReadings([], model)).toEqual({ beforeScaleMilligrams: null, afterScaleMilligrams: null });
    expect(fl10VisibleReadings([prediction, before], model)).toEqual({ beforeScaleMilligrams: 435000, afterScaleMilligrams: null });
    expect(nextFl10Event([prediction, before], after)).toEqual({ ok: false, code: "INVALID_ORDER" });
    expect(nextFl10Event([prediction, before, mixed], after)).toMatchObject({ ok: true, sequence: 4 });
    expect(fl10VisibleReadings([prediction, before, mixed, after], model)).toEqual(model);
  });

  it("rejects forged measurement, duplicate step and corrupt persisted history", () => {
    expect(nextFl10Event([], { ...prediction, beforeScaleMilligrams: 435000 })).toEqual({ ok: false, code: "INVALID_EVENT" });
    expect(nextFl10Event([prediction], prediction)).toEqual({ ok: false, code: "INVALID_ORDER" });
    expect(nextFl10Event([before], prediction)).toEqual({ ok: false, code: "INVALID_HISTORY" });
  });
});
