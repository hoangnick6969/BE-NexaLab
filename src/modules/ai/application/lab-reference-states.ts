import { reactions } from "../../../../packages/sim";
import { goldenTemplates } from "../../labs/application/simulation-versions";
import { CHALLENGE_PARAMETERS } from "../../lessons/application/lesson-content";

/**
 * Reference lab states TAI-06 verifies a proposal against (SPEC "Assumptions"). Sources, in order:
 * 1. the active `SimulationPackVersion.template.goldenCases` of the lab's model (`state`),
 * 2. else the active `SimulationConfigVersion.goldenCases` (`labState`),
 * 3. else BUILTIN: representative states derived from the engine itself (team-lead assumption 2026-11-09, so a fresh
 *    database without admin golden cases still has states; recorded in `team-lead-default-bounds.md`).
 * A state is data for the deterministic engine; it is never produced or edited by AI.
 */
export type ReferenceState = { label: string; state: unknown };
export type ReferenceSource = "PACK" | "CONFIG" | "BUILTIN";
export type LabContext = {
  labId: string;
  modelRef: string;
  packRanges: Record<string, { min: number; max: number }> | null;
  referenceStates: ReferenceState[];
  referenceSource: ReferenceSource | null;
};

const MAX_STATES = 24;

/**
 * Engine-derived states for the labs offered today. circuit/eye reuse `goldenTemplates` (admin starting states).
 * chemistry adds, for every reaction in the model, one exactly-balanced and one excess-reagent state, plus a correct and a wrong
 * litmus (pH) classification, so a reaction or pH variant has at least one state that can pass and one that cannot.
 */
export function builtinReferenceStates(labId: string): ReferenceState[] {
  const base = goldenTemplates(labId).map(({ label, labState }) => ({ label, state: labState }));
  if (labId !== "chemistry") return base.slice(0, MAX_STATES);
  const states: ReferenceState[] = [];
  for (const reaction of reactions) {
    const molesA = round(0.1 * reaction.ratioA);
    const molesB = round(0.1 * reaction.ratioB);
    states.push({ label: `${reaction.equation}: vừa đủ`, state: { reactionId: reaction.id, molesA, molesB } });
    states.push({ label: `${reaction.equation}: dư chất`, state: { reactionId: reaction.id, molesA, molesB: round(molesB + 0.1) } });
  }
  states.push({ label: "Quỳ tím: phân loại đúng ba lọ", state: { samples: { jar1: "acid", jar2: "neutral", jar3: "base" } } });
  states.push({ label: "Quỳ tím: phân loại sai", state: { samples: { jar1: "base", jar2: "neutral", jar3: "acid" } } });
  return states;
}
const round = (value: number) => Math.round(value * 1e6) / 1e6;

type PackRow = { modelRef: string; template: any };
type ConfigRow = { modelRef: string; goldenCases: any };

/** Pure selection of one lab's context from the active rows (used by the DB loader and by tests). */
export function selectLabContext(labId: string, packs: PackRow[], configs: ConfigRow[]): LabContext | null {
  const spec = CHALLENGE_PARAMETERS[labId];
  if (!spec) return null;
  const pack = packs.find((row) => row.modelRef === spec.modelRef) ?? null;
  // The lab's active pack is another model (e.g. circuit-bulb@1.0.0, which accepts no challenge parameters): a challenge
  // for this model would fail at assignment or attempt with 409 SIM_PACK_CONFIG_INCOMPATIBLE, so the lab offers nothing.
  if (!pack && packs.length > 0) return { labId, modelRef: spec.modelRef, packRanges: null, referenceStates: [], referenceSource: null };
  const ranges = pack?.template?.ranges && typeof pack.template.ranges === "object" ? (pack.template.ranges as Record<string, { min: number; max: number }>) : null;
  const packStates: ReferenceState[] = Array.isArray(pack?.template?.goldenCases)
    ? pack!.template.goldenCases.filter((g: any) => g && g.state !== undefined).map((g: any) => ({ label: String(g.label ?? "Ca mẫu"), state: g.state }))
    : [];
  const config = configs.find((row) => row.modelRef === spec.modelRef) ?? null;
  const configStates: ReferenceState[] = Array.isArray(config?.goldenCases)
    ? config!.goldenCases.filter((g: any) => g && g.labState !== undefined).map((g: any) => ({ label: String(g.label ?? "Ca mẫu"), state: g.labState }))
    : [];
  const [referenceStates, referenceSource]: [ReferenceState[], ReferenceSource | null] = packStates.length
    ? [packStates, "PACK"]
    : configStates.length
      ? [configStates, "CONFIG"]
      : (() => {
          const builtin = builtinReferenceStates(labId);
          return [builtin, builtin.length ? "BUILTIN" : null] as [ReferenceState[], ReferenceSource | null];
        })();
  return { labId, modelRef: spec.modelRef, packRanges: ranges, referenceStates: referenceStates.slice(0, MAX_STATES), referenceSource };
}

/** Reads the active pack and configuration rows for the labs (read-only), newest version first. */
export async function loadLabContexts(db: any, labIds: string[]): Promise<Map<string, LabContext>> {
  const [packs, configs] = await Promise.all([
    db.simulationPackVersion.findMany({ where: { labId: { in: labIds }, status: "active" }, orderBy: { version: "desc" }, select: { labId: true, modelRef: true, template: true } }),
    db.simulationConfigVersion.findMany({ where: { labId: { in: labIds }, status: "active" }, orderBy: { version: "desc" }, select: { labId: true, modelRef: true, goldenCases: true } }),
  ]);
  const out = new Map<string, LabContext>();
  for (const labId of labIds) {
    const context = selectLabContext(labId, packs.filter((row: any) => row.labId === labId), configs.filter((row: any) => row.labId === labId));
    if (context) out.set(labId, context);
  }
  return out;
}
