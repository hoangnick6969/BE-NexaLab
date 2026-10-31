import { z } from "zod";

type Species = "BaCl2" | "Na2SO4" | "BaSO4" | "NaCl";
type FixtureEntry = { species: Species; massMilligrams: number; amountMillimoles: number; molarMassTenthsGramsPerMol: number };
type ConservationFixture = {
  id: "barium-precipitation-reference-v1";
  reactants: [FixtureEntry, FixtureEntry];
  products: [FixtureEntry, FixtureEntry];
  source: { kind: "user_reference"; status: "unverified"; description: string; edition: string | null; page: number | null; sourceBlock: string | null };
};
type ModelErrorCode = "INVALID_SCHEMA" | "OUT_OF_RANGE" | "UNKNOWN_FIXTURE" | "INVALID_FIXTURE";
type Result<T> = { ok: true; value: T } | { ok: false; code: ModelErrorCode };
type MassOutput = {
  modelVersion: "1.0.0";
  fixtureId: string;
  systemBoundary: "two_open_cups_on_scale";
  assumptions: readonly ["no_splash", "no_evaporation", "no_loss", "no_residue_modeled"];
  reactants: FixtureEntry[];
  products: FixtureEntry[];
  reactantsTotalMilligrams: number;
  productsTotalMilligrams: number;
  beforeScaleMilligrams: number;
  afterScaleMilligrams: number;
};

const id = "barium-precipitation-reference-v1" as const;
const entrySchema = z.object({
  species: z.enum(["BaCl2", "Na2SO4", "BaSO4", "NaCl"]),
  massMilligrams: z.number().int().finite(),
  amountMillimoles: z.number().int().finite(),
  molarMassTenthsGramsPerMol: z.number().int().finite(),
}).strict();
const fixtureSchema = z.object({
  id: z.literal(id),
  reactants: z.tuple([entrySchema, entrySchema]),
  products: z.tuple([entrySchema, entrySchema]),
  source: z.object({
    kind: z.literal("user_reference"), status: z.literal("unverified"), description: z.string().trim().min(1),
    edition: z.string().nullable(), page: z.number().int().positive().nullable(), sourceBlock: z.string().nullable(),
  }).strict(),
}).strict();
const inputSchema = z.object({
  fixtureId: z.string(), cup1Milligrams: z.number().finite().int(), cup2Milligrams: z.number().finite().int(),
  solvent1Milligrams: z.number().finite().int(), solvent2Milligrams: z.number().finite().int(),
}).strict();

const reference: ConservationFixture = {
  id,
  reactants: [
    { species: "BaCl2", massMilligrams: 20800, amountMillimoles: 100, molarMassTenthsGramsPerMol: 2080 },
    { species: "Na2SO4", massMilligrams: 14200, amountMillimoles: 100, molarMassTenthsGramsPerMol: 1420 },
  ],
  products: [
    { species: "BaSO4", massMilligrams: 23300, amountMillimoles: 100, molarMassTenthsGramsPerMol: 2330 },
    { species: "NaCl", massMilligrams: 11700, amountMillimoles: 200, molarMassTenthsGramsPerMol: 585 },
  ],
  source: { kind: "user_reference", status: "unverified", description: "User-provided reference; textbook source not verified", edition: null, page: null, sourceBlock: null },
};

for (const item of [...reference.reactants, ...reference.products]) Object.freeze(item);
Object.freeze(reference.reactants);
Object.freeze(reference.products);
Object.freeze(reference.source);
Object.freeze(reference);
export const massConservationRegistry: Readonly<Record<string, ConservationFixture>> = Object.freeze({ [id]: reference });

export function validateConservationFixture(raw: unknown): Result<ConservationFixture> {
  const parsed = fixtureSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_FIXTURE" };
  const entries = [...parsed.data.reactants, ...parsed.data.products];
  const expected = [
    ["BaCl2", 20800, 100, 2080], ["Na2SO4", 14200, 100, 1420],
    ["BaSO4", 23300, 100, 2330], ["NaCl", 11700, 200, 585],
  ] as const;
  const valid = entries.every((item, i) => {
    const values = [item.massMilligrams, item.amountMillimoles, item.molarMassTenthsGramsPerMol];
    const product = item.amountMillimoles * item.molarMassTenthsGramsPerMol;
    return values.every(Number.isSafeInteger) && Number.isSafeInteger(item.massMilligrams * 10) && Number.isSafeInteger(product)
      && item.species === expected[i][0] && item.massMilligrams === expected[i][1]
      && item.amountMillimoles === expected[i][2] && item.molarMassTenthsGramsPerMol === expected[i][3]
      && item.massMilligrams * 10 === product;
  });
  const [a, b, c, d] = entries;
  if (!valid || a.amountMillimoles !== b.amountMillimoles || a.amountMillimoles !== c.amountMillimoles
      || d.amountMillimoles !== a.amountMillimoles * 2
      || a.massMilligrams + b.massMilligrams !== c.massMilligrams + d.massMilligrams)
    return { ok: false, code: "INVALID_FIXTURE" };
  return { ok: true, value: parsed.data };
}

export function evaluateMassConservationWithRegistry(raw: unknown, registry: Readonly<Record<string, unknown>>): Result<MassOutput> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID_SCHEMA" };
  const { fixtureId, cup1Milligrams, cup2Milligrams, solvent1Milligrams, solvent2Milligrams } = parsed.data;
  const bounded = (n: number, min: number) => Number.isSafeInteger(n) && n >= min && n <= 1000000;
  if (!bounded(cup1Milligrams, 1) || !bounded(cup2Milligrams, 1) || !bounded(solvent1Milligrams, 0) || !bounded(solvent2Milligrams, 0))
    return { ok: false, code: "OUT_OF_RANGE" };
  if (!Object.hasOwn(registry, fixtureId)) return { ok: false, code: "UNKNOWN_FIXTURE" };
  const fixture = validateConservationFixture(registry[fixtureId]);
  if (!fixture.ok || fixture.value.id !== fixtureId) return { ok: false, code: "INVALID_FIXTURE" };
  const reactants = fixture.value.reactants.map((entry) => ({ ...entry }));
  const products = fixture.value.products.map((entry) => ({ ...entry }));
  const reactantsTotalMilligrams = reactants.reduce((sum, entry) => sum + entry.massMilligrams, 0);
  const productsTotalMilligrams = products.reduce((sum, entry) => sum + entry.massMilligrams, 0);
  const containersAndSolvents = cup1Milligrams + cup2Milligrams + solvent1Milligrams + solvent2Milligrams;
  return { ok: true, value: {
    modelVersion: "1.0.0", fixtureId, systemBoundary: "two_open_cups_on_scale",
    assumptions: ["no_splash", "no_evaporation", "no_loss", "no_residue_modeled"],
    reactants, products, reactantsTotalMilligrams, productsTotalMilligrams,
    beforeScaleMilligrams: containersAndSolvents + reactantsTotalMilligrams,
    afterScaleMilligrams: containersAndSolvents + productsTotalMilligrams,
  } };
}

export function evaluateMassConservation(raw: unknown): Result<MassOutput> {
  return evaluateMassConservationWithRegistry(raw, massConservationRegistry);
}
