import { describe, expect, it } from "vitest";
import { foodWeb, foodWebChains } from "./index";

// FL-21 golden cases FW-01…FW-11, FW-X1…X3 (spec-fl-21-food-web/lab-definition.md §6).
const chain = (...nodes: string[]) => foodWeb({ setup: "chain", webId: "W1", nodes });
const remove = (speciesId: string) => foodWeb({ setup: "remove", webId: "W1", speciesId }) as any;

describe("food-web@1.0.0 (FL-21 golden cases)", () => {
  it("FW-01: roles follow the SGK groups", () => {
    const { roles } = foodWeb({ setup: "roles", webId: "W1" }) as any;
    expect(Object.entries(roles).filter(([, role]) => role === "PRODUCER").map(([id]) => id)).toEqual(["co", "cay-xanh"]);
    expect(roles["nam-vi-khuan"]).toBe("DECOMPOSER");
    expect(Object.values(roles).filter((role) => role === "CONSUMER")).toHaveLength(8);
  });

  it("FW-02: a full chain from a producer", () => {
    expect(chain("co", "chau-chau", "ech", "ran", "dai-bang")).toMatchObject({ valid: true, brokenAt: null, startsWithProducer: true, length: 5, levels: [1, 2, 3, 4, 5] });
  });
  it("FW-03: a short valid chain", () => {
    expect(chain("co", "tho", "cao")).toMatchObject({ valid: true, startsWithProducer: true, length: 3 });
  });
  it("FW-04: a missing link is reported where it breaks", () => {
    expect(chain("co", "ech", "ran")).toMatchObject({ valid: false, brokenAt: 1 });
  });
  it("FW-05: valid links that do not start with a producer", () => {
    expect(chain("chau-chau", "ech", "ran", "dai-bang")).toMatchObject({ valid: true, startsWithProducer: false });
  });

  it("FW-06: energy keeps 1/10 per transfer, the rest is heat", () => {
    expect(foodWeb({ setup: "energy", webId: "W1", chain: ["co", "chau-chau", "ech", "ran"] }))
      .toMatchObject({ levelsKJ: [10000, 1000, 100, 10], heatKJ: [9000, 900, 90] });
  });

  it("FW-07: removing the snake releases its prey and costs the eagle one food", () => {
    const result = remove("ran");
    expect(result.effects.ech.effect).toBe("INCREASE");
    expect(result.effects["chim-sau"].effect).toBe("INCREASE");
    expect(result.effects["dai-bang"]).toEqual({ effect: "DECREASE", onlyFood: false });
    expect(result.effects.co.effect).toBe("NO_DIRECT_EFFECT");
    expect(result.brokenChains).toBe(4);
  });
  it("FW-08: removing trees takes the caterpillar's only food", () => {
    const result = remove("cay-xanh");
    expect(result.effects.sau).toEqual({ effect: "DECREASE", onlyFood: true });
    expect(result.brokenChains).toBe(2);
  });
  it("FW-09: removing the rabbit", () => {
    const result = remove("tho");
    expect(result.effects.co.effect).toBe("INCREASE");
    expect(result.effects.cao).toEqual({ effect: "DECREASE", onlyFood: true });
    expect(result.effects["dai-bang"]).toEqual({ effect: "DECREASE", onlyFood: false });
  });

  it("FW-10: exactly four human causes disturb the balance", () => {
    const { causes } = foodWeb({ setup: "causes", webId: "W1" }) as any;
    expect(Object.entries(causes).filter(([, cause]: any) => cause.disturbs).map(([id]) => id).sort()).toEqual(["khai-thac", "o-nhiem", "pha-rung", "san-bat"]);
  });

  it("FW-11: chains through each species (common links)", () => {
    const chains = foodWebChains();
    const count = (id: string) => chains.filter((c) => c.includes(id as any)).length;
    expect(chains).toHaveLength(6);
    expect([count("ran"), count("dai-bang"), count("cao"), count("chau-chau")]).toEqual([4, 5, 1, 2]);
  });

  it.each([
    ["unknown id", ["co", "lua"]],
    ["duplicate node", ["co", "chau-chau", "co"]],
    ["one node", ["co"]],
    ["seven nodes", ["co", "chau-chau", "ech", "ran", "dai-bang", "tho", "cao"]],
  ])("FW-X1: rejects a chain with %s", (_, nodes) => {
    expect(() => chain(...nodes)).toThrow();
  });
  it("FW-X2: rejects removing the decomposer or another energy chain", () => {
    expect(() => remove("nam-vi-khuan")).toThrow();
    expect(() => foodWeb({ setup: "energy", webId: "W1", chain: ["co", "tho", "cao", "dai-bang"] })).toThrow();
  });
  it("FW-X3: rejects extra keys and other webs", () => {
    expect(() => foodWeb({ setup: "roles", webId: "W2" })).toThrow();
    expect(() => foodWeb({ setup: "causes", webId: "W1", extra: 1 })).toThrow();
  });
});
