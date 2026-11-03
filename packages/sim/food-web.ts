import { z } from "zod";

// FL-21 food-web@1.0.0: an illustrative 11-species food web (spec-fl-21 D-4).
// Roles and the meaning of a food chain follow SGK KHTN 8 Bài 44; the species,
// feeding links, cause-to-species mapping and the 1/10 energy transfer are a
// teaching convention, not SGK data. Removal effects are first-order only (D-5).

const SGK_ROLES = "sgk-khtn8-nxbgd-2026-p0182-b0019";
const SGK_CAUSES = "sgk-khtn8-nxbgd-2026-p0192-b0006";

export const FOOD_WEB_SPECIES = {
  co: { role: "PRODUCER" },
  "cay-xanh": { role: "PRODUCER" },
  "chau-chau": { role: "CONSUMER" },
  sau: { role: "CONSUMER" },
  tho: { role: "CONSUMER" },
  ech: { role: "CONSUMER" },
  "chim-sau": { role: "CONSUMER" },
  ran: { role: "CONSUMER" },
  cao: { role: "CONSUMER" },
  "dai-bang": { role: "CONSUMER" },
  "nam-vi-khuan": { role: "DECOMPOSER" },
} as const;
export type FoodWebSpeciesId = keyof typeof FOOD_WEB_SPECIES;
export type FoodWebRole = "PRODUCER" | "CONSUMER" | "DECOMPOSER";

/** Feeding links, food → eater (the SGK arrow convention). */
export const FOOD_WEB_EDGES: ReadonlyArray<readonly [FoodWebSpeciesId, FoodWebSpeciesId]> = [
  ["co", "chau-chau"], ["co", "tho"],
  ["cay-xanh", "sau"],
  ["chau-chau", "ech"], ["chau-chau", "chim-sau"],
  ["sau", "ech"], ["sau", "chim-sau"],
  ["ech", "ran"], ["chim-sau", "ran"],
  ["tho", "cao"], ["tho", "dai-bang"],
  ["ran", "dai-bang"],
];

export const FOOD_WEB_CAUSES = {
  "pha-rung": { disturbs: true, removes: "cay-xanh" },
  "san-bat": { disturbs: true, removes: "ran" },
  "khai-thac": { disturbs: true, removes: "tho" },
  "o-nhiem": { disturbs: true, removes: "ech" },
  "trong-rung": { disturbs: false, removes: null },
  "bao-ton": { disturbs: false, removes: null },
} as const;
export type FoodWebCauseId = keyof typeof FOOD_WEB_CAUSES;

export const FOOD_WEB_ENERGY_CHAIN = ["co", "chau-chau", "ech", "ran"] as const;
/** Illustrative: the producer captures 10 000 kJ and each transfer keeps 1/10. */
export const FOOD_WEB_PRODUCER_KJ = 10000;
export const FOOD_WEB_TRANSFER = { num: 1, den: 10 } as const;
export const FOOD_WEB_SOURCES = { roles: SGK_ROLES, causes: SGK_CAUSES, web: "ILLUSTRATIVE", energy: "ILLUSTRATIVE" } as const;

const speciesIds = Object.keys(FOOD_WEB_SPECIES) as [FoodWebSpeciesId, ...FoodWebSpeciesId[]];
const species = z.enum(speciesIds);
const web = z.literal("W1");
export const foodWebSchema = z.discriminatedUnion("setup", [
  z.object({ setup: z.literal("roles"), webId: web }).strict(),
  z.object({ setup: z.literal("chain"), webId: web, nodes: z.array(species).min(2).max(6) }).strict(),
  z.object({ setup: z.literal("energy"), webId: web, chain: z.tuple([z.literal("co"), z.literal("chau-chau"), z.literal("ech"), z.literal("ran")]) }).strict(),
  z.object({ setup: z.literal("remove"), webId: web, speciesId: species }).strict(),
  z.object({ setup: z.literal("causes"), webId: web }).strict(),
]).superRefine((state, ctx) => {
  if (state.setup === "chain" && new Set(state.nodes).size !== state.nodes.length)
    ctx.addIssue({ code: "custom", message: "Một loài chỉ xuất hiện một lần trong chuỗi" });
  if (state.setup === "remove" && FOOD_WEB_SPECIES[state.speciesId].role === "DECOMPOSER")
    ctx.addIssue({ code: "custom", message: "Mô hình không loại bỏ sinh vật phân giải" });
});
export type FoodWebState = z.infer<typeof foodWebSchema>;

const foodsOf = (id: FoodWebSpeciesId) => FOOD_WEB_EDGES.filter(([, eater]) => eater === id).map(([food]) => food);
const eatersOf = (id: FoodWebSpeciesId) => FOOD_WEB_EDGES.filter(([food]) => food === id).map(([, eater]) => eater);
const linked = (food: FoodWebSpeciesId, eater: FoodWebSpeciesId) => FOOD_WEB_EDGES.some(([a, b]) => a === food && b === eater);

/** Every full chain, from a producer to a consumer that nothing eats. */
export function foodWebChains(): FoodWebSpeciesId[][] {
  const chains: FoodWebSpeciesId[][] = [];
  const walk = (path: FoodWebSpeciesId[]) => {
    const next = eatersOf(path[path.length - 1]);
    if (!next.length) chains.push(path);
    for (const eater of next) walk([...path, eater]);
  };
  for (const id of speciesIds) if (FOOD_WEB_SPECIES[id].role === "PRODUCER") walk([id]);
  return chains;
}

export function foodWeb(raw: unknown) {
  const state = foodWebSchema.parse(raw);
  if (state.setup === "roles") {
    return {
      version: "1.0.0", setup: "roles" as const,
      roles: Object.fromEntries(speciesIds.map((id) => [id, FOOD_WEB_SPECIES[id].role])) as Record<FoodWebSpeciesId, FoodWebRole>,
    };
  }
  if (state.setup === "chain") {
    const brokenIndex = state.nodes.findIndex((id, index) => index > 0 && !linked(state.nodes[index - 1], id));
    return {
      version: "1.0.0", setup: "chain" as const,
      nodes: [...state.nodes],
      valid: brokenIndex === -1,
      brokenAt: brokenIndex === -1 ? null : brokenIndex,
      startsWithProducer: FOOD_WEB_SPECIES[state.nodes[0]].role === "PRODUCER",
      length: state.nodes.length,
      levels: state.nodes.map((_, index) => index + 1),
    };
  }
  if (state.setup === "energy") {
    // Integer arithmetic: each level keeps num/den of the level below; the rest is heat.
    const levelsKJ = [FOOD_WEB_PRODUCER_KJ];
    for (let i = 1; i < state.chain.length; i++) levelsKJ.push(levelsKJ[i - 1] * FOOD_WEB_TRANSFER.num / FOOD_WEB_TRANSFER.den);
    return {
      version: "1.0.0", setup: "energy" as const,
      chain: [...state.chain], levelsKJ,
      heatKJ: levelsKJ.slice(0, -1).map((value, i) => value - levelsKJ[i + 1]),
      transfer: { ...FOOD_WEB_TRANSFER },
    };
  }
  if (state.setup === "remove") {
    const removed = state.speciesId;
    const foods = foodsOf(removed), eaters = eatersOf(removed);
    const effects = Object.fromEntries(speciesIds.filter((id) => id !== removed).map((id) => {
      if (foods.includes(id)) return [id, { effect: "INCREASE", onlyFood: false }];
      if (eaters.includes(id)) return [id, { effect: "DECREASE", onlyFood: foodsOf(id).length === 1 }];
      return [id, { effect: "NO_DIRECT_EFFECT", onlyFood: false }];
    })) as Record<FoodWebSpeciesId, { effect: "INCREASE" | "DECREASE" | "NO_DIRECT_EFFECT"; onlyFood: boolean }>;
    return {
      version: "1.0.0", setup: "remove" as const,
      removed, effects,
      brokenChains: foodWebChains().filter((chain) => chain.includes(removed)).length,
    };
  }
  return {
    version: "1.0.0", setup: "causes" as const,
    causes: Object.fromEntries(Object.entries(FOOD_WEB_CAUSES).map(([id, cause]) => [id, { disturbs: cause.disturbs, removes: cause.removes }])) as
      Record<FoodWebCauseId, { disturbs: boolean; removes: FoodWebSpeciesId | null }>,
  };
}
