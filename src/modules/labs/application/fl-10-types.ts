import type { evaluateMassConservation } from "../../../../packages/sim";

export type MassConservationOutput = Extract<ReturnType<typeof evaluateMassConservation>, { ok: true }>["value"];
