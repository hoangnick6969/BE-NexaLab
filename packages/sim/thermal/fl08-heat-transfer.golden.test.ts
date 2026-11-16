import { describe, expect, it } from "vitest";
import { evaluateConduction, evaluateConvection, evaluateRadiation, FL08_HEAT_TRANSFER_EXPLORE_CONFIG as config, pinMeltTimes, type RadiationEvent } from "./index";

const max = config.clock.maxSeconds;
const conduction = config.conduction!;
const convection = config.convection!;
const radiation = config.radiation!;
const rods = (materials: Array<"copper" | "aluminium" | "steel" | "glass" | "wood">, elapsedSeconds: number, heated = true) =>
  evaluateConduction(conduction, max, { rods: materials, heated, elapsedSeconds });
const dropped = (result: ReturnType<typeof rods>) => (result.ok ? result.rods.map((rod) => rod.pins.filter((pin) => pin.dropped).map((pin) => pin.id).join("")) : []);
const event = (atSeconds: number, patch: Partial<RadiationEvent> = {}): RadiationEvent => ({ atSeconds, lampOn: true, screen: false, surface: "black", ...patch });

describe("heat-transfer@1.0.0 golden (spec §3.3)", () => {
  it("melt times follow t = 16 x² / K with Bảng 28.1 (spec §3.2 table)", () => {
    expect(pinMeltTimes(conduction, "copper", max)).toEqual([2, 9, 21, 37, 58]);
    expect(pinMeltTimes(conduction, "aluminium", max)).toEqual([5, 18, 41, 73, 114]);
    expect(pinMeltTimes(conduction, "steel", max)).toEqual([14, 56, 126, 224, 350]);
    expect(pinMeltTimes(conduction, "glass", max)).toEqual([null, null, null, null, null]);
    expect(pinMeltTimes(conduction, "wood", max)).toEqual([null, null, null, null, null]);
  });
  it("G-01 copper at 60 s: all five pins have dropped, a to e", () => {
    expect(dropped(rods(["copper"], 60))).toEqual(["abcde"]);
    expect(dropped(rods(["copper"], 20))).toEqual(["ab"]);
  });
  it("G-02 copper, aluminium and steel heated together, 120 s", () => {
    expect(dropped(rods(["copper", "aluminium", "steel"], 120))).toEqual(["abcde", "abcde", "ab"]);
  });
  it("G-03 glass and wood drop nothing in 600 s", () => {
    expect(dropped(rods(["glass", "wood"], 600))).toEqual(["", ""]);
  });
  it("G-04 steel at 600 s: all pins, pin e at 350 s", () => {
    expect(dropped(rods(["steel"], 349))).toEqual(["abcd"]);
    expect(dropped(rods(["steel"], 600))).toEqual(["abcde"]);
  });
  it("nothing drops before the lamp is lit", () => {
    expect(dropped(rods(["copper"], 600, false))).toEqual([""]);
  });

  it("G-05 tube (1): wax at the bottom, flame near the mouth, never melts", () => {
    const result = evaluateConvection(convection, max, { flames: { "1": "mouth" }, elapsedSeconds: 600 });
    expect(result.ok && result.tubes[0]).toMatchObject({ id: "1", wax: "bottom", melts: false, melted: false });
  });
  it("G-06 tube (2): wax at the mouth, flame at the bottom, melts at 40 s", () => {
    const at = (t: number) => evaluateConvection(convection, max, { flames: { "2": "bottom" }, elapsedSeconds: t });
    const tube = (t: number) => { const result = at(t); return result.ok ? result.tubes[1] : null; };
    expect(tube(39)).toMatchObject({ melts: true, melted: false });
    expect(tube(40)).toMatchObject({ melts: true, melted: true });
  });

  it("G-07 black flask lit for 60 s from 25.0 °C reaches 30.1 °C, rising every second", () => {
    let previous = 0;
    for (let t = 0; t <= 60; t++) {
      const result = evaluateRadiation(radiation, max, [event(0)], t);
      if (!result.ok) throw new Error(result.code);
      expect(result.tenthsC).toBeGreaterThanOrEqual(previous);
      previous = result.tenthsC;
    }
    expect(previous).toBe(301);
  });
  it("G-08 a silvered flask warms less: 26.3 °C at 60 s, never more than 2.0 °C up", () => {
    expect(evaluateRadiation(radiation, max, [event(0, { surface: "silver" })], 60)).toMatchObject({ ok: true, tenthsC: 263 });
    expect(evaluateRadiation(radiation, max, [event(0, { surface: "silver" })], 600)).toMatchObject({ ok: true, tenthsC: 270, targetTenthsC: 270 });
  });
  it("G-09 the wood screen after 60 s brings it back down: 25.7 °C after 120 s more", () => {
    const events = [event(0), event(60, { screen: true })];
    const at = (t: number) => { const result = evaluateRadiation(radiation, max, events, t); return result.ok ? result.tenthsC : NaN; };
    expect(at(60)).toBe(301);
    expect(at(180)).toBe(257);
    for (let t = 61; t <= 180; t++) expect(at(t)).toBeLessThanOrEqual(at(t - 1));
    expect(evaluateRadiation(radiation, max, events, 180)).toMatchObject({ exposed: false, targetTenthsC: 250 });
  });
  it("G-10 jumping to a time and stepping one second at a time agree on all three stations", () => {
    const events = [event(0), event(45, { surface: "silver" }), event(200, { lampOn: false }), event(330, { lampOn: true, screen: true })];
    const jump = evaluateRadiation(radiation, max, events, 600);
    let stepped: ReturnType<typeof evaluateRadiation> | null = null;
    for (let t = 0; t <= 600; t++) stepped = evaluateRadiation(radiation, max, events, t);
    expect(stepped).toEqual(jump);
    expect(dropped(rods(["steel"], 600))).toEqual(dropped(rods(["steel"], 600)));
  });

  it("E-01 rejects too many rods, another material and a time outside the window", () => {
    expect(rods(["copper", "copper", "steel", "glass"], 10)).toEqual({ ok: false, code: "TOO_MANY_RODS" });
    expect(evaluateConduction({ ...conduction, materials: ["copper"] }, max, { rods: ["steel"], heated: true, elapsedSeconds: 0 })).toEqual({ ok: false, code: "MATERIAL_NOT_ALLOWED" });
    expect(rods(["copper"], 601)).toEqual({ ok: false, code: "TIME_OUT_OF_RANGE" });
    expect(evaluateRadiation(radiation, max, [event(5)], 10)).toEqual({ ok: false, code: "TIME_OUT_OF_RANGE" });
    expect(evaluateRadiation(radiation, max, [event(0), event(50), event(20)], 60)).toEqual({ ok: false, code: "EVENTS_OUT_OF_ORDER" });
  });
});
