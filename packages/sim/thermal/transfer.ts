/**
 * heat-transfer@1.0.0: the three FL-08 stations as pure functions of simulated time (integer seconds).
 * Conduction: wax at x mm melts at t = timeConstant × x² / K (K from Bảng 28.1), an illustrative time scale.
 * Convection: wax melts after meltSeconds when the flame is at or below it, never when it is above.
 * Radiation: the thermometer approaches its target with time constant τ, in closed form per segment,
 * so jumping straight to a time and stepping one second at a time give the same reading.
 */
import { CONDUCTIVITY_TABLE, type ConductionSettings, type ConvectionSettings, type RadiationSettings, type RodMaterial } from "./contracts";

export const PIN_IDS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export type Pin = { id: string; positionMm: number; meltSeconds: number | null; dropped: boolean };
export type RodReading = { material: RodMaterial; pins: Pin[] };
export type ConductionResult =
  | { ok: true; rods: RodReading[] }
  | { ok: false; code: "TIME_OUT_OF_RANGE" | "TOO_MANY_RODS" | "MATERIAL_NOT_ALLOWED" };

const inRange = (t: number, max: number) => Number.isInteger(t) && t >= 0 && t <= max;

/** Melt time of each pin of one rod, or null when it does not melt within the observation window. */
export function pinMeltTimes(settings: ConductionSettings, material: RodMaterial, maxSeconds: number): Array<number | null> {
  const k = CONDUCTIVITY_TABLE[material].relative;
  return settings.pinPositionsMm.map((x) => {
    const t = Math.round((settings.timeConstant * x * x) / k);
    return t <= maxSeconds ? t : null;
  });
}

export function evaluateConduction(settings: ConductionSettings, maxSeconds: number, state: { rods: readonly RodMaterial[]; heated: boolean; elapsedSeconds: number }): ConductionResult {
  if (!inRange(state.elapsedSeconds, maxSeconds)) return { ok: false, code: "TIME_OUT_OF_RANGE" };
  if (state.rods.length > settings.maxRods) return { ok: false, code: "TOO_MANY_RODS" };
  if (state.rods.some((material) => !settings.materials.includes(material))) return { ok: false, code: "MATERIAL_NOT_ALLOWED" };
  return {
    ok: true,
    rods: state.rods.map((material) => {
      const times = pinMeltTimes(settings, material, maxSeconds);
      return {
        material,
        pins: settings.pinPositionsMm.map((positionMm, index) => ({
          id: PIN_IDS[index], positionMm, meltSeconds: times[index],
          dropped: state.heated && times[index] !== null && times[index]! <= state.elapsedSeconds,
        })),
      };
    }),
  };
}

export type FlamePosition = "bottom" | "mouth";
export type TubeReading = { id: "1" | "2"; wax: "bottom" | "top"; flame: FlamePosition | null; melts: boolean; melted: boolean };
export type ConvectionResult = { ok: true; tubes: TubeReading[] } | { ok: false; code: "TIME_OUT_OF_RANGE" | "UNKNOWN_TUBE" };

const HEIGHT = { bottom: 0, mouth: 1, top: 1 } as const;

export function evaluateConvection(settings: ConvectionSettings, maxSeconds: number, state: { flames: Partial<Record<"1" | "2", FlamePosition | null>>; elapsedSeconds: number }): ConvectionResult {
  if (!inRange(state.elapsedSeconds, maxSeconds)) return { ok: false, code: "TIME_OUT_OF_RANGE" };
  if (Object.keys(state.flames).some((id) => !settings.tubes.some((tube) => tube.id === id))) return { ok: false, code: "UNKNOWN_TUBE" };
  return {
    ok: true,
    tubes: settings.tubes.map((tube) => {
      const flame = state.flames[tube.id] ?? null;
      // Heated water rises: the flame melts the wax only when it is at or below it.
      const melts = flame !== null && HEIGHT[flame] <= HEIGHT[tube.wax];
      return { id: tube.id, wax: tube.wax, flame, melts, melted: melts && state.elapsedSeconds >= settings.meltSeconds };
    }),
  };
}

export type Surface = "black" | "silver";
export type RadiationEvent = { atSeconds: number; lampOn: boolean; screen: boolean; surface: Surface };
export type RadiationResult = { ok: true; tenthsC: number; exposed: boolean; targetTenthsC: number } | { ok: false; code: "TIME_OUT_OF_RANGE" | "EVENTS_OUT_OF_ORDER" };

const targetOf = (settings: RadiationSettings, event: RadiationEvent) =>
  event.lampOn && !event.screen ? settings.startTenthsC + (settings.riseTenthsC * settings.absorptance[event.surface]) / 100 : settings.startTenthsC;

/** Thermometer reading at `atSeconds`, given the bench settings changes so far (the first event is the start, at 0 s). */
export function evaluateRadiation(settings: RadiationSettings, maxSeconds: number, events: readonly RadiationEvent[], atSeconds: number): RadiationResult {
  if (!inRange(atSeconds, maxSeconds) || events.length === 0 || events[0].atSeconds !== 0) return { ok: false, code: "TIME_OUT_OF_RANGE" };
  for (let index = 1; index < events.length; index++) if (events[index].atSeconds < events[index - 1].atSeconds) return { ok: false, code: "EVENTS_OUT_OF_ORDER" };
  let temperature = settings.startTenthsC;
  let current = events[0];
  for (const next of [...events.slice(1).filter((event) => event.atSeconds <= atSeconds), null]) {
    const until = next ? next.atSeconds : atSeconds;
    const target = targetOf(settings, current);
    temperature = target + (temperature - target) * Math.exp(-(until - current.atSeconds) / settings.tauSeconds);
    if (next) current = next;
  }
  return { ok: true, tenthsC: Math.round(temperature), exposed: current.lampOn && !current.screen, targetTenthsC: Math.round(targetOf(settings, current)) };
}
