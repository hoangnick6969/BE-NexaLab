/**
 * wet-bench@1.0.0 engine: pure functions over a bench of vessels.
 * Reactions complete instantly to the limiting reagent (no kinetics, no temperature).
 * A forbidden or unreviewed pair rejects the operation and keeps the last valid state.
 */
import { solveAcidBase } from "./acid-base";
import {
  CYLINDER_READING_MICROLITERS, operationSchema, VESSEL_SPECS, WET_BENCH_ENGINE,
  type ApplyResult, type Bench, type ChemistryLabConfig, type MeasurementResult, type Operation, type OutOfScope,
  type ReactionObservation, type SolutionTarget, type Transition, type VesselKind, type VesselState, type VesselVisualState,
} from "./contracts";
import { LITMUS_BANDS, PHENOLPHTHALEIN_BANDS } from "./fl13-acid-base.data";
import { classifyPair, isPairChecked, K2_REACTIONS, type StoichiometricReaction } from "./reactions";
import { reagentById } from "./reagents";
import { microgramsOf, nanomolesOf, SPECIES, type SpeciesId } from "./species";

export type EngineContext = {
  allowedReactions: readonly string[];
  availableReagents: readonly string[];
  /** Engine 1.1.0: µg of powder that dissolves per µL of liquid, by species. A powder without an entry never dissolves. */
  solubilityMicrogramsPerMicroliter?: Partial<Record<SpeciesId, number>>;
};

/** The engine context a Lab config implies: its shelf, its reactions and its solubility constants (mg/mL = µg/µL). */
export function engineContextFor(config: ChemistryLabConfig): EngineContext {
  const solubility: Partial<Record<SpeciesId, number>> = {};
  for (const item of config.solutes ?? []) {
    const composition = reagentById(item.reagentId)?.composition;
    if (composition?.kind === "powder") solubility[composition.species] = item.maxMilligramsPerMilliliter;
  }
  return { allowedReactions: config.allowedReactions, availableReagents: config.availableReagents.map((item) => item.reagentId), solubilityMicrogramsPerMicroliter: solubility };
}

const clone = (vessel: VesselState): VesselState => ({
  ...vessel,
  dissolved: { ...vessel.dissolved },
  solids: vessel.solids.map((piece) => ({ ...piece, coating: piece.coating ? { ...piece.coating } : null })),
  precipitates: { ...vessel.precipitates },
  powders: { ...vessel.powders },
  trappedGas: { ...vessel.trappedGas },
  indicatorDrops: { ...vessel.indicatorDrops },
  added: Object.fromEntries(Object.entries(vessel.added).map(([key, value]) => [key, { ...value }])),
});

const isVesselKind = (kind: string): kind is VesselKind => kind in VESSEL_SPECS;

export function emptyVessel(vesselId: string, kind: VesselKind): VesselState {
  const spec = VESSEL_SPECS[kind];
  return {
    vesselId, kind, capacityMicroliters: spec.capacityMicroliters, tareMicrograms: spec.tareMicrograms, stopperable: spec.stopperable,
    stoppered: false, solutionMicroliters: 0, dissolved: {}, solids: [], precipitates: {}, powders: {}, trappedGas: {}, indicatorDrops: {},
    contentMicrograms: 0, added: {},
  };
}

/** Builds the starting bench from a Lab config. Initial contents bypass the shelf allow-list. */
export function createBench(config: ChemistryLabConfig): Bench {
  let bench: Bench = { vessels: {}, nextPiece: 1 };
  for (const item of config.enabledApparatus) {
    if (!isVesselKind(item.kind)) continue;
    bench.vessels[item.id] = { ...emptyVessel(item.id, item.kind), stoppered: Boolean(item.initial?.stoppered && VESSEL_SPECS[item.kind].stopperable) };
  }
  const initialReagents = config.enabledApparatus.flatMap((item) => (item.initial?.contents ?? []).map((content) => content.reagentId));
  const context: EngineContext = { allowedReactions: config.allowedReactions, availableReagents: initialReagents };
  for (const item of config.enabledApparatus) {
    for (const content of item.initial?.contents ?? []) {
      const reagent = reagentById(content.reagentId);
      if (!reagent) throw new Error(`Unknown initial reagent ${content.reagentId}`);
      if (reagent.composition.kind === "powder") throw new Error(`Powder ${reagent.id} cannot be initial contents of ${item.id}`);
      const op: Operation = reagent.composition.kind === "solid"
        ? { type: "add_solid", vesselId: item.id, reagentId: reagent.id, pieces: content.pieces ?? 1 }
        : reagent.composition.kind === "indicator"
          ? { type: "add_indicator", vesselId: item.id, reagentId: reagent.id, drops: content.pieces ?? 1 }
          : { type: "add_liquid", vesselId: item.id, reagentId: reagent.id, microliters: content.microliters ?? 1000 };
      const result = applyOperation(bench, op, context);
      if (result.status !== "applied") throw new Error(`Invalid initial contents for ${item.id}`);
      bench = result.bench;
    }
  }
  return bench;
}

const recordAdded = (vessel: VesselState, reagentId: string, delta: Partial<{ microliters: number; pieces: number; drops: number; micrograms: number }>) => {
  const current = vessel.added[reagentId] ?? { microliters: 0, pieces: 0, drops: 0 };
  const micrograms = (current.micrograms ?? 0) + (delta.micrograms ?? 0);
  vessel.added[reagentId] = {
    microliters: current.microliters + (delta.microliters ?? 0), pieces: current.pieces + (delta.pieces ?? 0), drops: current.drops + (delta.drops ?? 0),
    ...(micrograms ? { micrograms } : {}),
  };
};

const addAmount = (record: Partial<Record<SpeciesId, number>>, species: SpeciesId, nanomoles: number) => {
  record[species] = (record[species] ?? 0) + nanomoles;
};

/** Species present in a vessel that take part in pair checks, sorted for determinism. */
function presentSpecies(vessel: VesselState): SpeciesId[] {
  const set = new Set<SpeciesId>();
  for (const [species, amount] of Object.entries(vessel.dissolved) as Array<[SpeciesId, number]>) if (amount > 0) set.add(species);
  for (const piece of vessel.solids) {
    if (piece.nanomoles > 0) set.add(piece.species);
    if (piece.coating && piece.coating.nanomoles > 0) set.add(piece.coating.species);
  }
  for (const [species, amount] of Object.entries(vessel.precipitates) as Array<[SpeciesId, number]>) if (amount > 0) set.add(species);
  return [...set].filter(isPairChecked).sort();
}

const neutralized = (vessel: VesselState) => {
  let acid = 0;
  let base = 0;
  for (const [species, amount] of Object.entries(vessel.dissolved) as Array<[SpeciesId, number]>) {
    const role = SPECIES[species].acidBase;
    if (role.kind === "strong_acid") acid += amount * role.protons;
    else if (role.kind === "weak_acid") acid += amount;
    else if (role.kind === "strong_base") base += amount * role.hydroxides;
  }
  return Math.min(acid, base);
};

const available = (vessel: VesselState, species: SpeciesId) =>
  SPECIES[species].phase === "s"
    ? vessel.solids.filter((piece) => piece.species === species).reduce((sum, piece) => sum + piece.nanomoles, 0)
    : vessel.dissolved[species] ?? 0;

function consume(vessel: VesselState, species: SpeciesId, nanomoles: number) {
  if (SPECIES[species].phase !== "s") {
    vessel.dissolved[species] = (vessel.dissolved[species] ?? 0) - nanomoles;
    return null;
  }
  let remaining = nanomoles;
  let first: VesselState["solids"][number] | null = null;
  for (const piece of vessel.solids) {
    if (piece.species !== species || piece.nanomoles <= 0 || remaining <= 0) continue;
    first ??= piece;
    const take = Math.min(piece.nanomoles, remaining);
    piece.nanomoles -= take;
    remaining -= take;
  }
  return first;
}

/** Runs allowed reactions to completion in one vessel. Returns the out-of-scope pair if any. */
function settle(vessel: VesselState, context: EngineContext, transition: Transition): OutOfScope | null {
  for (let guard = 0; guard < 32; guard += 1) {
    const present = presentSpecies(vessel);
    const runnable: StoichiometricReaction[] = [];
    for (let i = 0; i < present.length; i += 1) {
      for (let j = i + 1; j < present.length; j += 1) {
        const verdict = classifyPair(present[i], present[j], context.allowedReactions);
        if (verdict.kind === "unreviewed") return { code: "PAIR_UNREVIEWED", vesselId: vessel.vesselId, species: [present[i], present[j]], reasonVi: verdict.reasonVi };
        if (verdict.kind === "not_in_lab_scope") return { code: "PAIR_NOT_IN_LAB_SCOPE", vesselId: vessel.vesselId, species: [present[i], present[j]] };
        if (verdict.kind === "reaction") {
          const rule = K2_REACTIONS.find((item) => item.id === verdict.reactionId) as StoichiometricReaction;
          if (!runnable.includes(rule)) runnable.push(rule);
        }
      }
    }
    runnable.sort((a, b) => K2_REACTIONS.indexOf(a) - K2_REACTIONS.indexOf(b));
    const rule = runnable.find((item) => Math.min(...item.reactants.map((r) => Math.floor(available(vessel, r.species) / r.coeff))) > 0);
    if (!rule) return null;
    const extent = Math.min(...rule.reactants.map((r) => Math.floor(available(vessel, r.species) / r.coeff)));
    let metalPiece: VesselState["solids"][number] | null = null;
    for (const reactant of rule.reactants) {
      const piece = consume(vessel, reactant.species, extent * reactant.coeff);
      if (piece) metalPiece ??= piece;
    }
    for (const product of rule.products) {
      const amount = extent * product.coeff;
      if (product.fate === "dissolved") addAmount(vessel.dissolved, product.species, amount);
      else if (product.fate === "precipitate") addAmount(vessel.precipitates, product.species, amount);
      else if (product.fate === "coating" && metalPiece) {
        metalPiece.coating = { species: product.species, nanomoles: (metalPiece.coating?.nanomoles ?? 0) + amount };
      } else if (product.fate === "gas") {
        addAmount(transition.gasProducedNanomoles, product.species, amount);
        if (vessel.stoppered) addAmount(vessel.trappedGas, product.species, amount);
        else {
          const lost = microgramsOf(product.species, amount);
          vessel.contentMicrograms -= lost;
          transition.gasEscapedMicrograms += lost;
        }
      }
    }
    const fired = transition.fired.find((item) => item.reactionId === rule.id);
    if (fired) fired.extentNanomoles += extent;
    else transition.fired.push({ reactionId: rule.id, extentNanomoles: extent });
  }
  return null;
}

const newTransition = (vesselId: string): Transition => ({ vesselId, fired: [], gasProducedNanomoles: {}, gasEscapedMicrograms: 0 });

/** Applies one learner operation. Never mutates the input bench. */
export function applyOperation(bench: Bench, raw: Operation, context: EngineContext): ApplyResult {
  const parsed = operationSchema.safeParse(raw);
  if (!parsed.success) return { status: "rejected", code: "INVALID_OPERATION" };
  const op = parsed.data;
  const next: Bench = { vessels: { ...bench.vessels }, nextPiece: bench.nextPiece };
  const take = (vesselId: string) => {
    const vessel = bench.vessels[vesselId];
    if (!vessel) return null;
    const copy = clone(vessel);
    next.vessels[vesselId] = copy;
    return copy;
  };

  if (op.type === "toggle_stopper") {
    const vessel = take(op.vesselId);
    if (!vessel) return { status: "rejected", code: "UNKNOWN_VESSEL" };
    if (!vessel.stopperable) return { status: "rejected", code: "NOT_STOPPERABLE" };
    vessel.stoppered = !vessel.stoppered;
    if (!vessel.stoppered) {
      // Opening releases trapped gas from the weighed system.
      for (const [species, amount] of Object.entries(vessel.trappedGas) as Array<[SpeciesId, number]>) vessel.contentMicrograms -= microgramsOf(species, amount);
      vessel.trappedGas = {};
    }
    return { status: "applied", bench: next, transitions: [] };
  }
  if (op.type === "stir") {
    const vessel = take(op.vesselId);
    if (!vessel) return { status: "rejected", code: "UNKNOWN_VESSEL" };
    const before = neutralized(vessel);
    dissolvePowders(vessel, context);
    return finish(bench, next, vessel, before, context);
  }
  if (op.type === "fill_to_mark") {
    const target = bench.vessels[op.vesselId];
    if (!target) return { status: "rejected", code: "UNKNOWN_VESSEL" };
    if (target.kind !== "volumetric_flask_100ml") return { status: "rejected", code: "NO_MARK" };
    const composition = reagentById(op.reagentId)?.composition;
    if (composition && !(composition.kind === "solution" && composition.solute === null)) return { status: "rejected", code: "WRONG_REAGENT_FORM" };
    const missing = target.capacityMicroliters - target.solutionMicroliters;
    if (missing <= 0) return { status: "rejected", code: "VESSEL_FULL" };
    return applyOperation(bench, { type: "add_liquid", vesselId: op.vesselId, reagentId: op.reagentId, microliters: missing }, context);
  }
  if (op.type === "empty_vessel") {
    const vessel = take(op.vesselId);
    if (!vessel) return { status: "rejected", code: "UNKNOWN_VESSEL" };
    next.vessels[op.vesselId] = { ...emptyVessel(vessel.vesselId, vessel.kind), stoppered: false };
    return { status: "applied", bench: next, transitions: [] };
  }
  if (op.type === "pour_all") {
    if (op.fromVesselId === op.toVesselId) return { status: "rejected", code: "SAME_VESSEL" };
    const from = take(op.fromVesselId);
    const to = take(op.toVesselId);
    if (!from || !to) return { status: "rejected", code: "UNKNOWN_VESSEL" };
    if (from.solutionMicroliters === 0 && from.solids.length === 0 && Object.keys(from.precipitates).length === 0) return { status: "rejected", code: "EMPTY_SOURCE" };
    if (to.solutionMicroliters + from.solutionMicroliters > to.capacityMicroliters) return { status: "rejected", code: "VESSEL_FULL" };
    if (from.stoppered) return { status: "rejected", code: "INVALID_OPERATION" };
    if (Object.values(from.powders).some((amount) => (amount ?? 0) > 0)) return { status: "rejected", code: "NOT_DISSOLVED" };
    const before = neutralized(to) + neutralized(from);
    to.solutionMicroliters += from.solutionMicroliters;
    for (const [species, amount] of Object.entries(from.dissolved) as Array<[SpeciesId, number]>) addAmount(to.dissolved, species, amount);
    for (const [species, amount] of Object.entries(from.precipitates) as Array<[SpeciesId, number]>) addAmount(to.precipitates, species, amount);
    for (const [indicator, drops] of Object.entries(from.indicatorDrops)) to.indicatorDrops[indicator as "phenolphthalein"] = (to.indicatorDrops[indicator as "phenolphthalein"] ?? 0) + (drops ?? 0);
    to.solids.push(...from.solids);
    to.contentMicrograms += from.contentMicrograms;
    for (const [reagentId, amount] of Object.entries(from.added)) recordAdded(to, reagentId, amount);
    next.vessels[op.fromVesselId] = { ...emptyVessel(from.vesselId, from.kind), stoppered: false };
    return finish(bench, next, to, before, context);
  }

  const vessel = take(op.vesselId);
  if (!vessel) return { status: "rejected", code: "UNKNOWN_VESSEL" };
  // Adding into a stoppered flask is modelled as "add, then re-stopper at once": gas stays trapped.
  const reagent = reagentById(op.reagentId);
  if (!reagent) return { status: "rejected", code: "UNKNOWN_REAGENT" };
  if (!context.availableReagents.includes(reagent.id)) return { status: "rejected", code: "REAGENT_NOT_AVAILABLE" };
  const before = neutralized(vessel);
  const composition = reagent.composition;
  if (op.type === "add_liquid") {
    if (composition.kind !== "solution") return { status: "rejected", code: "WRONG_REAGENT_FORM" };
    if (vessel.solutionMicroliters + op.microliters > vessel.capacityMicroliters) return { status: "rejected", code: "VESSEL_FULL" };
    vessel.solutionMicroliters += op.microliters;
    if (composition.solute) addAmount(vessel.dissolved, composition.solute, composition.millimolar * op.microliters);
    vessel.contentMicrograms += composition.densityMicrogramsPerMicroliter * op.microliters;
    recordAdded(vessel, reagent.id, { microliters: op.microliters });
  } else if (op.type === "add_indicator") {
    if (composition.kind !== "indicator") return { status: "rejected", code: "WRONG_REAGENT_FORM" };
    const microliters = composition.microlitersPerDrop * op.drops;
    if (vessel.solutionMicroliters + microliters > vessel.capacityMicroliters) return { status: "rejected", code: "VESSEL_FULL" };
    vessel.solutionMicroliters += microliters;
    vessel.indicatorDrops[composition.indicator] = (vessel.indicatorDrops[composition.indicator] ?? 0) + op.drops;
    vessel.contentMicrograms += composition.densityMicrogramsPerMicroliter * microliters;
    recordAdded(vessel, reagent.id, { drops: op.drops });
  } else if (op.type === "add_solid_mass") {
    if (composition.kind !== "powder") return { status: "rejected", code: "WRONG_REAGENT_FORM" };
    const micrograms = op.milligrams * 1000;
    vessel.powders[composition.species] = (vessel.powders[composition.species] ?? 0) + micrograms;
    vessel.contentMicrograms += micrograms;
    recordAdded(vessel, reagent.id, { micrograms });
  } else {
    if (composition.kind !== "solid") return { status: "rejected", code: "WRONG_REAGENT_FORM" };
    for (let i = 0; i < op.pieces; i += 1) {
      vessel.solids.push({
        pieceId: `piece-${next.nextPiece}`, species: composition.species, shape: composition.shape,
        nanomoles: composition.nanomolesPerPiece, initialNanomoles: composition.nanomolesPerPiece, coating: null,
      });
      next.nextPiece += 1;
      vessel.contentMicrograms += microgramsOf(composition.species, composition.nanomolesPerPiece);
    }
    recordAdded(vessel, reagent.id, { pieces: op.pieces });
  }
  return finish(bench, next, vessel, before, context);
}

/**
 * Stirring dissolves powder up to the solubility constant for the liquid in the vessel; what is left stays powder.
 * Solid volume is neglected: the solution volume is the volume of liquid added.
 */
function dissolvePowders(vessel: VesselState, context: EngineContext) {
  for (const [species, powder] of Object.entries(vessel.powders) as Array<[SpeciesId, number]>) {
    if (powder <= 0) continue;
    const limit = (context.solubilityMicrogramsPerMicroliter?.[species] ?? 0) * vessel.solutionMicroliters;
    const room = Math.max(0, limit - microgramsOf(species, vessel.dissolved[species] ?? 0));
    const taken = Math.min(powder, room);
    if (taken <= 0) continue;
    addAmount(vessel.dissolved, species, nanomolesOf(species, taken));
    if (taken >= powder) delete vessel.powders[species];
    else vessel.powders[species] = powder - taken;
  }
}

/** True when there is a solution and nothing is left undissolved. */
export const isDissolved = (vessel: VesselState) => vessel.solutionMicroliters > 0 && Object.values(vessel.powders).every((amount) => (amount ?? 0) <= 0);

export type SolutionAssessment =
  | { ok: false; code: "NO_SOLUTION" | "NOT_DISSOLVED" | "NO_SOLUTE" }
  | {
    ok: true;
    /** C% in tenths of a percent: solute mass over solution mass. */
    tenthsPercent: number;
    /** Molarity in mmol/L: amount of solute over the volume of solution. */
    millimolar: number;
    solutionMicrograms: number;
    solutionMicroliters: number;
    /** Whether this vessel meets the target (integer comparison, no rounding). */
    withinTarget: boolean;
  };

/**
 * The learner's conclusion: the real concentration of a prepared solution, checked against a target.
 * Refuses while powder is undissolved, so the learner must stir and, if needed, add liquid first.
 */
export function assessSolution(vessel: VesselState, target: SolutionTarget): SolutionAssessment {
  const composition = reagentById(target.reagentId)?.composition;
  if (composition?.kind !== "powder") return { ok: false, code: "NO_SOLUTE" };
  if (vessel.solutionMicroliters <= 0) return { ok: false, code: "NO_SOLUTION" };
  if (!isDissolved(vessel)) return { ok: false, code: "NOT_DISSOLVED" };
  const nanomoles = vessel.dissolved[composition.species] ?? 0;
  if (nanomoles <= 0) return { ok: false, code: "NO_SOLUTE" };
  const soluteMicrograms = microgramsOf(composition.species, nanomoles);
  const solutionMicrograms = vessel.contentMicrograms;
  const tenthsPercent = Math.round((soluteMicrograms * 1000) / solutionMicrograms);
  const millimolar = Math.round(nanomoles / vessel.solutionMicroliters);
  const withinTarget = target.kind === "molarity"
    ? Math.abs(nanomoles - target.millimolar * vessel.solutionMicroliters) <= target.toleranceMillimolar * vessel.solutionMicroliters
    : Math.abs(soluteMicrograms * 1000 - target.tenthsPercent * solutionMicrograms) <= target.toleranceTenthsPercent * solutionMicrograms;
  return { ok: true, tenthsPercent, millimolar, solutionMicrograms, solutionMicroliters: vessel.solutionMicroliters, withinTarget };
}

/** Volume read on a graduated cylinder: the level, to the nearest millilitre. */
export function readVolume(vessel: VesselState): { ok: true; milliliters: number } | { ok: false; code: "NO_SOLUTION" } {
  if (vessel.solutionMicroliters <= 0) return { ok: false, code: "NO_SOLUTION" };
  return { ok: true, milliliters: Math.round(vessel.solutionMicroliters / CYLINDER_READING_MICROLITERS) };
}

function finish(previous: Bench, next: Bench, vessel: VesselState, neutralizedBefore: number, context: EngineContext): ApplyResult {
  const transition = newTransition(vessel.vesselId);
  const outOfScope = settle(vessel, context, transition);
  if (outOfScope) return { status: "out_of_scope", bench: previous, outOfScope };
  const delta = neutralized(vessel) - neutralizedBefore;
  if (delta > 0) transition.fired.unshift({ reactionId: "acid-base.neutralization", extentNanomoles: delta });
  return { status: "applied", bench: next, transitions: [transition] };
}

/** Litmus band for a pH × 100 value (red ≤ 5.00 < purple < 8.00 ≤ blue). */
export const litmusColour = (centiPh: number) => LITMUS_BANDS.find((item) => centiPh <= item.maxCentiPhInclusive)!.id;
/** Phenolphthalein band for a pH × 100 value. */
export const phenolphthaleinBand = (centiPh: number) =>
  PHENOLPHTHALEIN_BANDS.find((item) => centiPh >= item.fromCentiPh && centiPh < item.toCentiPhExclusive)!;

/** pH meter or litmus paper reading. Measurements never change the vessel. */
export function measure(vessel: VesselState, kind: "ph_meter" | "litmus_paper"): MeasurementResult {
  if (vessel.solutionMicroliters === 0 || Object.values(vessel.added).every((item) => item.microliters === 0)) return { kind, ok: false, code: "NO_SOLUTION" };
  const result = solveAcidBase({ solutionMicroliters: vessel.solutionMicroliters, dissolved: vessel.dissolved });
  if (!result.ok) return { kind, ok: false, code: result.code };
  if (kind === "ph_meter") return { kind, ok: true, tenthsPh: result.tenthsPh, centiPh: result.centiPh };
  return { kind, ok: true, colour: litmusColour(result.centiPh), centiPh: result.centiPh };
}

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb: number[]) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;

const POWDER_COLOR: Partial<Record<SpeciesId, string>> = { NaCl: "#f4f4f2", CuSO4: "#8ec3e6" };
/** Heap of undissolved powder; amount reaches 1 at 20 g. */
function powderLook(vessel: VesselState): VesselVisualState["powder"] {
  const [species, micrograms] = (Object.entries(vessel.powders) as Array<[SpeciesId, number]>).find(([, amount]) => amount > 0) ?? [null, 0];
  return species ? { color: POWDER_COLOR[species] ?? "#f4f4f2", amount: Math.min(1, micrograms / 20_000_000) } : null;
}

/** Declarative scene state for one vessel. `last` is the transition that just happened there, if any. */
export function observeVessel(vessel: VesselState, last: Transition | null = null): ReactionObservation {
  const litres = vessel.solutionMicroliters * 1e-6;
  const layers: Array<{ color: string; opacity: number }> = [];
  if (litres > 0) {
    for (const [species, amount] of Object.entries(vessel.dissolved) as Array<[SpeciesId, number]>) {
      const tint = SPECIES[species].ionColor;
      if (!tint || amount <= 0) continue;
      const millimolar = (amount * 1e-9 / litres) * 1000;
      layers.push({ color: tint.color, opacity: Math.min(1, millimolar / tint.fullAtMillimolar) * 0.75 });
    }
  }
  let indicator: VesselVisualState["indicator"] = null;
  if ((vessel.indicatorDrops.phenolphthalein ?? 0) > 0) {
    const reading = measure(vessel, "ph_meter");
    if (reading.ok && reading.kind === "ph_meter") {
      const band = phenolphthaleinBand(reading.centiPh);
      indicator = { id: "phenolphthalein", band: band.id };
      if (band.color) layers.push({ color: band.color, opacity: band.id === "deep_pink" ? 0.82 : 0.5 });
    } else indicator = { id: "phenolphthalein", band: reading.ok ? "colourless" : reading.code === "NO_SOLUTION" ? "colourless" : "unknown" };
  }
  const visible = layers.filter((layer) => layer.opacity > 0.02);
  const opacity = visible.length ? Math.min(0.85, 1 - visible.reduce((product, layer) => product * (1 - layer.opacity), 1)) : 0;
  const weight = visible.reduce((sum, layer) => sum + layer.opacity, 0);
  const liquidTint = visible.length
    ? { color: rgbToHex([0, 1, 2].map((channel) => visible.reduce((sum, layer) => sum + hexToRgb(layer.color)[channel] * layer.opacity, 0) / weight)), opacity }
    : null;

  const [gasId, gasAmount] = (Object.entries(last?.vesselId === vessel.vesselId ? last.gasProducedNanomoles : {}) as Array<[SpeciesId, number]>)[0] ?? [null, 0];
  let intensity: VesselVisualState["gasBubbles"]["intensity"] = "none";
  if (gasId && gasAmount > 0) {
    const rule = K2_REACTIONS.find((item) => item.kind === "stoichiometric" && last!.fired.some((fired) => fired.reactionId === item.id) && item.products.some((p) => p.species === gasId)) as StoichiometricReaction | undefined;
    const shape = vessel.solids.find((piece) => piece.nanomoles > 0)?.shape ?? vessel.solids[0]?.shape;
    intensity = (shape && rule?.gasVigor?.[shape]) || "medium";
  }
  const [precipitateId, precipitateAmount] = (Object.entries(vessel.precipitates) as Array<[SpeciesId, number]>).find(([, amount]) => amount > 0) ?? [null, 0];
  return {
    vesselId: vessel.vesselId,
    visual: {
      liquidLevel: Math.min(1, vessel.solutionMicroliters / vessel.capacityMicroliters),
      liquidTint,
      indicator,
      gasBubbles: { intensity, gasId: intensity === "none" ? null : gasId },
      precipitate: precipitateId ? { species: precipitateId, color: SPECIES[precipitateId].solidColor ?? "#ffffff", amount: Math.min(1, precipitateAmount / 1_000_000) } : null,
      solids: vessel.solids.map((piece) => ({
        pieceId: piece.pieceId, species: piece.species, shape: piece.shape,
        remainingRatio: piece.initialNanomoles ? piece.nanomoles / piece.initialNanomoles : 0,
        coatingColor: piece.coating && piece.coating.nanomoles > 0 ? SPECIES[piece.coating.species].solidColor : null,
      })),
      stoppered: vessel.stoppered,
      powder: powderLook(vessel),
    },
    contentMicrograms: vessel.contentMicrograms,
    totalMicrograms: vessel.tareMicrograms + vessel.contentMicrograms,
    engine: WET_BENCH_ENGINE,
  };
}

/** Electronic scale reading for the vessels standing on it, in µg. */
export const scaleReadingMicrograms = (vessels: readonly VesselState[]) =>
  vessels.reduce((sum, vessel) => sum + vessel.tareMicrograms + vessel.contentMicrograms, 0);
