import { describe, expect, it } from "vitest";
import { comparePower, evaluateHoist, evaluatePendulum, FL24_ENERGY_EXPLORE_CONFIG as config, PENDULUM_POSITIONS, pendulumSwing, workAndPower, type PendulumPosition } from "./index";

const pendulum = config.pendulum!;
const hoist = config.hoist!;
const swing = (massG: number, dropHeightMm: number, position: PendulumPosition) => evaluatePendulum(pendulum, { massG, dropHeightMm, position });

describe("mechanical-energy@1.0.0 golden (spec §3.2)", () => {
  it("G-01 at the release point: Wt 600, Wđ 0, W 600 mJ", () => {
    expect(swing(200, 300, "release")).toEqual({ ok: true, position: "release", heightMm: 300, potentialMj: 600, kineticMj: 0, mechanicalMj: 600 });
  });
  it("G-02 halfway down (150 mm): Wt 300, Wđ 300, W 600 mJ", () => {
    expect(swing(200, 300, "mid-down")).toEqual({ ok: true, position: "mid-down", heightMm: 150, potentialMj: 300, kineticMj: 300, mechanicalMj: 600 });
  });
  it("G-03 at the lowest point: Wt 0, Wđ 600, W 600 mJ", () => {
    expect(swing(200, 300, "lowest")).toEqual({ ok: true, position: "lowest", heightMm: 0, potentialMj: 0, kineticMj: 600, mechanicalMj: 600 });
  });
  it("G-04 the bob rises to exactly 300 mm on the other side", () => {
    expect(swing(200, 300, "far-high")).toMatchObject({ ok: true, heightMm: 300, potentialMj: 600, kineticMj: 0 });
    expect(swing(200, 300, "mid-up")).toEqual({ ...swing(200, 300, "mid-down"), position: "mid-up" });
  });
  it("G-05 m 500 g, h₀ 100 mm: W 500 mJ; doubling the mass doubles W", () => {
    expect(swing(500, 100, "release")).toMatchObject({ ok: true, mechanicalMj: 500 });
    const light = swing(200, 100, "release");
    const heavy = swing(400, 100, "release");
    expect(light.ok && heavy.ok && heavy.mechanicalMj).toBe(light.ok && 2 * light.mechanicalMj);
  });
  it("W stays constant over the swing and Wđ is largest at the lowest point", () => {
    for (const massG of pendulum.massesG) {
      for (let h = 0; h <= pendulum.maxDropHeightMm; h += pendulum.heightStepMm) {
        const readings = pendulumSwing(pendulum, massG, h);
        expect(readings).toHaveLength(PENDULUM_POSITIONS.length);
        for (const reading of readings) {
          expect(reading.ok).toBe(true);
          if (!reading.ok) continue;
          expect(reading.potentialMj + reading.kineticMj).toBe(reading.mechanicalMj);
          expect(Number.isInteger(reading.potentialMj)).toBe(true);
          expect(reading.kineticMj).toBeLessThanOrEqual(readings[2].ok ? readings[2].kineticMj : -1);
        }
      }
    }
  });
  it("G-06 a 1 000 g load lifted 500 mm: F 10 000 mN, A 5 000 mJ", () => {
    expect(evaluateHoist(hoist, { massG: 1000, distanceMm: 500, motorId: "slow" })).toMatchObject({ ok: true, forceMilliNewtons: 10000, distanceMm: 500, workMj: 5000 });
  });
  it("G-07 slow motor 4 000 ms gives 1 250 mW, fast 2 000 ms gives 2 500 mW, same work", () => {
    const slow = evaluateHoist(hoist, { massG: 1000, distanceMm: 500, motorId: "slow" });
    const fast = evaluateHoist(hoist, { massG: 1000, distanceMm: 500, motorId: "fast" });
    expect(slow).toMatchObject({ ok: true, durationMs: 4000, workMj: 5000, powerMw: 1250 });
    expect(fast).toMatchObject({ ok: true, durationMs: 2000, workMj: 5000, powerMw: 2500 });
    if (slow.ok && fast.ok) expect(comparePower(slow, fast)).toBe("second");
  });
  it("compares power exactly when the rounded mW would tie", () => {
    expect(comparePower({ workMj: 1000, durationMs: 3000 }, { workMj: 1000, durationMs: 3001 })).toBe("first");
    expect(comparePower({ workMj: 500, durationMs: 1000 }, { workMj: 1000, durationMs: 2000 })).toBe("equal");
  });
});

describe("mechanical-energy@1.0.0 errors (spec §3.2)", () => {
  it("E-01 refuses a mass off the 100 g grid and a height outside 0–300 mm", () => {
    expect(swing(150, 100, "release")).toEqual({ ok: false, code: "MASS_NOT_ALLOWED" });
    expect(swing(200, 310, "release")).toEqual({ ok: false, code: "HEIGHT_OUT_OF_RANGE" });
    expect(swing(200, -10, "release")).toEqual({ ok: false, code: "HEIGHT_OUT_OF_RANGE" });
    expect(swing(200, 155, "release")).toEqual({ ok: false, code: "HEIGHT_OFF_STEP" });
    expect(swing(200, 100, "top" as PendulumPosition)).toEqual({ ok: false, code: "POSITION_UNKNOWN" });
  });
  it("E-02 refuses t = 0, a distance outside the range and a motor outside the config", () => {
    expect(workAndPower(10000, 500, 0)).toEqual({ ok: false, code: "DURATION_NOT_POSITIVE" });
    expect(evaluateHoist(hoist, { massG: 1000, distanceMm: 1100, motorId: "slow" })).toEqual({ ok: false, code: "DISTANCE_OUT_OF_RANGE" });
    expect(evaluateHoist(hoist, { massG: 1000, distanceMm: 0, motorId: "slow" })).toEqual({ ok: false, code: "DISTANCE_OUT_OF_RANGE" });
    expect(evaluateHoist(hoist, { massG: 1000, distanceMm: 250, motorId: "slow" })).toEqual({ ok: false, code: "DISTANCE_OFF_STEP" });
    expect(evaluateHoist(hoist, { massG: 1000, distanceMm: 500, motorId: "turbo" })).toEqual({ ok: false, code: "MOTOR_NOT_ALLOWED" });
    expect(evaluateHoist(hoist, { massG: 300, distanceMm: 500, motorId: "slow" })).toEqual({ ok: false, code: "MASS_NOT_ALLOWED" });
  });
});
