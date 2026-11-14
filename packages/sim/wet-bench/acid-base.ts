/**
 * Acid–base solver for dilute aqueous solutions at 25 °C.
 * Works on formal (analytical) amounts, so neutralization needs no stoichiometric step:
 * the charge balance  [H⁺] + C_base = [OH⁻] + C_acid + Σ C_weak·Ka/(Ka + [H⁺])  is solved for [H⁺].
 * The left side minus the right side increases monotonically with [H⁺], so bisection on
 * log10[H⁺] always converges to the single root.
 */
import { KW, WEAK_ACID_KA } from "./fl13-acid-base.data";
import { SPECIES, type SpeciesId } from "./species";

export type AcidBaseInput = {
  solutionMicroliters: number;
  /** Formal amounts in nanomoles. */
  dissolved: Partial<Record<SpeciesId, number>>;
};

export type AcidBaseResult =
  | { ok: true; ph: number; centiPh: number; tenthsPh: number; strongExcessNanomolesH: number }
  | { ok: false; code: "NO_SOLUTION" | "PH_UNMODELED"; unmodeled?: SpeciesId[] };

export function solveAcidBase(input: AcidBaseInput): AcidBaseResult {
  if (!(input.solutionMicroliters > 0)) return { ok: false, code: "NO_SOLUTION" };
  const litres = input.solutionMicroliters * 1e-6;
  let acidEquivalents = 0; // mol of anions from strong acids (= H⁺ released)
  let baseEquivalents = 0; // mol of cation charge balancing OH⁻ from strong bases
  const weak: Array<{ total: number; ka: number }> = [];
  const unmodeled: SpeciesId[] = [];
  for (const [id, nanomoles] of Object.entries(input.dissolved) as Array<[SpeciesId, number]>) {
    if (!nanomoles) continue;
    const role = SPECIES[id].acidBase;
    const mol = nanomoles * 1e-9;
    if (role.kind === "strong_acid") acidEquivalents += mol * role.protons;
    else if (role.kind === "strong_base") baseEquivalents += mol * role.hydroxides;
    else if (role.kind === "weak_acid") weak.push({ total: mol / litres, ka: WEAK_ACID_KA[role.constantId] });
    else if (role.kind === "unmodeled") unmodeled.push(id);
  }
  if (unmodeled.length) return { ok: false, code: "PH_UNMODELED", unmodeled };
  const ca = acidEquivalents / litres;
  const cb = baseEquivalents / litres;
  const balance = (h: number) => h + cb - KW / h - ca - weak.reduce((sum, acid) => sum + (acid.total * acid.ka) / (acid.ka + h), 0);
  let low = -16; // log10[H⁺]
  let high = 2;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (balance(10 ** mid) > 0) high = mid;
    else low = mid;
  }
  const ph = -(low + high) / 2;
  return {
    ok: true,
    ph,
    centiPh: Math.round(ph * 100),
    tenthsPh: Math.round(ph * 10),
    strongExcessNanomolesH: Math.round((acidEquivalents - baseEquivalents) * 1e9),
  };
}
