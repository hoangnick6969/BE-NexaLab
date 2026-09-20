import { describe, it, expect } from "vitest";
import { circuit, chemistry, eye, eyeParts, reactions } from "./index";
const state = (r = 350) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    { id: "l", type: "led" },
    { id: "r", type: "resistor", value: r },
    { id: "s", type: "switch", closed: true },
  ],
  edges: [
    { source: "b", target: "l" },
    { source: "l", target: "r" },
    { source: "r", target: "s" },
    { source: "s", target: "b" },
  ],
});
describe("Scientific engine", () => {
  it("9V, 2V LED, 350Ω = exactly 20mA and passes", () => {
    expect(circuit(state())).toMatchObject({
      current: 0.02,
      verdict: "passed",
      ledState: "ON",
    });
  });
  it("330Ω exceeds 20mA", () => {
    expect(circuit(state(330))).toMatchObject({
      verdict: "partial",
      status: "LED_OVERLOAD",
    });
  });
  it("does not invent finite current for an ideal short", () => {
    expect(circuit(state(0))).toMatchObject({
      current: null,
      verdict: "partial",
    });
  });
  it("detects disconnected wire", () => {
    const s = state();
    s.edges.pop();
    expect(circuit(s).status).toBe("OPEN_CIRCUIT");
  });
  it("detects open switch", () => {
    const s = state();
    s.nodes[3].closed = false;
    expect(circuit(s).status).toBe("SWITCH_OPEN");
  });
  it("is deterministic", () =>
    expect(circuit(state(470))).toEqual(circuit(state(470))));
  it("rejects forged endpoints and duplicate nodes", () => {
    const s = state();
    s.edges[0].target = "forged";
    expect(() => circuit(s)).toThrow();
    s.nodes.push(s.nodes[0]);
    expect(() => circuit(s)).toThrow();
  });
  it("rejects voltage outside valid range", () => {
    const s = state();
    s.nodes[0].value = 100;
    expect(() => circuit(s)).toThrow();
  });
  it("independent parallel branches sum source current", () => {
    const s = state(700);
    s.nodes.push(
      { id: "l2", type: "led" },
      { id: "r2", type: "resistor", value: 700 },
    );
    s.edges.push(
      { source: "b", target: "l2" },
      { source: "l2", target: "r2" },
      { source: "r2", target: "b" },
    );
    expect(circuit(s)).toMatchObject({ current: 0.02, verdict: "passed" });
  });
  it.each(reactions)("balances $id stoichiometry", (r) => {
    expect(
      chemistry({
        reactionId: r.id,
        molesA: r.ratioA * 0.1,
        molesB: r.ratioB * 0.1,
      }),
    ).toMatchObject({ extent: 0.1, verdict: "passed", limiting: "balanced" });
  });
  it("reports limiting reagent", () =>
    expect(
      chemistry({ reactionId: "mg-hcl", molesA: 0.1, molesB: 0.1 }),
    ).toMatchObject({
      extent: 0.05,
      remainingA: 0.05,
      remainingB: 0,
      limiting: "HCl",
      verdict: "partial",
    }));
  it("zero reactant makes no product", () =>
    expect(
      chemistry({ reactionId: "mg-hcl", molesA: 0, molesB: 0.1 }).verdict,
    ).toBe("not_passed"));
  it("rejects unsupported reaction and negative amount", () => {
    expect(() =>
      chemistry({ reactionId: "x", molesA: 1, molesB: 1 }),
    ).toThrow();
    expect(() =>
      chemistry({ reactionId: "mg-hcl", molesA: -1, molesB: 1 }),
    ).toThrow();
  });
  it("grades anatomy on the server", () => {
    expect(
      eye({ answers: Object.fromEntries(eyeParts.map((p) => [p.id, p.name])) })
        .score,
    ).toBe(100);
    expect(eye({ answers: {} }).score).toBe(0);
  });
});
