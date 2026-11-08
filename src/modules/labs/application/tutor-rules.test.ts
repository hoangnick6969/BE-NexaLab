import { describe, expect, it } from "vitest";
import { chemistry, circuit, eye } from "../../../../packages/sim";
import {
  CIRCUIT_HINT_STATUSES, decideTutorLevel, labDigest, normalizeLabState, renderTutorTemplate, TUTOR_KEYS, TUTOR_RULES, TUTOR_TEMPLATES,
  tutorKey, tutorRulesDigest, type TutorLevel,
} from "./tutor-rules";

const loop = (resistance?: number, extra: Record<string, unknown> = {}) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    ...(resistance === undefined ? [] : [{ id: "r", type: "resistor", value: resistance }]),
    { id: "l", type: "led" },
    { id: "s", type: "switch", closed: true },
  ],
  edges: resistance === undefined
    ? [{ source: "b", target: "l" }, { source: "l", target: "s" }, { source: "s", target: "b" }]
    : [{ source: "b", target: "r" }, { source: "r", target: "l" }, { source: "l", target: "s" }, { source: "s", target: "b" }],
  ...extra,
});

describe("tutor-rules@1 (SAI-01)", () => {
  it("is pinned: changing any template text needs a version bump", () => {
    expect(TUTOR_RULES).toBe("tutor-rules@1");
    expect(tutorRulesDigest()).toBe("28028f1cf0dfb87ccd03a2ec0b94f98acb4554d314aaad8ffc6f2a83e50b2180");
  });

  it("has two variants for every (key, level) and never labels the student", () => {
    for (const key of TUTOR_KEYS)
      for (const level of [1, 2, 3, 4] as TutorLevel[]) {
        const variants = TUTOR_TEMPLATES[key][level - 1];
        expect(variants.length).toBeGreaterThanOrEqual(2);
        expect(new Set(variants).size).toBe(variants.length);
        for (const text of variants) expect(text).not.toMatch(/hiểu sai|kém|giỏi|yếu|dốt|điểm/i);
      }
  });

  it("covers every status the circuit engine can return; SAFE is the passed state, not a hint key", () => {
    const statuses = new Set([
      circuit({ nodes: [{ id: "b", type: "battery" }, { id: "l", type: "led" }], edges: [{ source: "b", target: "l" }] }).status,
      circuit({ ...loop(350), nodes: loop(350).nodes.map((n) => n.id === "s" ? { ...n, closed: false } : n) }).status,
      circuit(loop()).status,
      circuit(loop(350)).status,
      circuit({ nodes: [{ id: "b", type: "battery" }, { id: "r", type: "resistor" }, { id: "r2", type: "resistor" }],
        edges: [{ source: "b", target: "r" }, { source: "r", target: "r2" }, { source: "r2", target: "b" }] }).status,
      circuit({ ...loop(350), nodes: loop(350).nodes.map((n) => n.id === "b" ? { ...n, value: 2 } : n) }).status,
    ]);
    expect([...statuses].sort()).toEqual(["LED_OVERLOAD", "LOW_CURRENT", "NO_LED", "OPEN_CIRCUIT", "SAFE", "SWITCH_OPEN"]);
    for (const status of statuses) if (status !== "SAFE") expect(CIRCUIT_HINT_STATUSES).toContain(status);
    expect(tutorKey({ status: "SOMETHING_NEW" })).toBe("OPEN_CIRCUIT");
  });

  it("picks chemistry, pH and eye keys from the engine result", () => {
    expect(tutorKey(chemistry({ reactionId: "fe-cuso4", molesA: 1, molesB: 0.5 }))).toBe("CHEMISTRY");
    expect(tutorKey(chemistry({ samples: { jar1: "acid", jar2: "acid", jar3: "base" } }))).toBe("CHEMISTRY_PH");
    expect(tutorKey(eye({ answers: {} }))).toBe("EYE");
  });

  it("fills level-4 numbers from the stored engine result only", () => {
    expect(renderTutorTemplate("LED_OVERLOAD", 4, 0, circuit(loop(100)))).toContain("350 Ω");
    const reaction = chemistry({ reactionId: "fe-cuso4", molesA: 1, molesB: 0.5 });
    expect(renderTutorTemplate("CHEMISTRY", 4, 1, reaction)).toContain("0.5 mol");
    expect(renderTutorTemplate("CHEMISTRY", 4, 0, reaction)).not.toContain("{");
  });

  it("normalizes away layout but keeps wiring, values and switch states", () => {
    const base = loop(350);
    const moved = { ...base, nodes: base.nodes.map((n, i) => ({ ...n, position: { x: i * 40, y: 10 }, selected: i === 0 })).reverse(), edges: [...base.edges].reverse().map((e) => ({ source: e.target, target: e.source })) };
    expect(labDigest(moved)).toBe(labDigest(base));
    expect(labDigest(loop(330))).not.toBe(labDigest(base));
    expect(labDigest({ ...base, nodes: base.nodes.map((n) => n.id === "s" ? { ...n, closed: false } : n) })).not.toBe(labDigest(base));
    expect(normalizeLabState({ answers: { cornea: "  Giác Mạc " } })).toEqual({ answers: { cornea: "giác mạc" } });
    expect(labDigest({ reactionId: "fe-cuso4", molesA: 1, molesB: 0.5 })).not.toBe(labDigest({ reactionId: "fe-cuso4", molesA: 1, molesB: 1 }));
  });

  it("escalates only after a real retry and never skips or passes level 4", () => {
    const repeats = (counts: Record<number, number>) => (level: number) => counts[level] ?? 0;
    expect(decideTutorLevel({ key: "OPEN_CIRCUIT", currentDigest: "x", previous: null, sameLevelRepeats: repeats({}) }))
      .toEqual({ level: 1, variant: 0, escalated: false });
    expect(decideTutorLevel({ key: "OPEN_CIRCUIT", currentDigest: "y", previous: { level: 1, labDigest: "x" }, sameLevelRepeats: repeats({ 1: 1 }) }))
      .toEqual({ level: 2, variant: 0, escalated: true });
    expect(decideTutorLevel({ key: "OPEN_CIRCUIT", currentDigest: "x", previous: { level: 1, labDigest: "x" }, sameLevelRepeats: repeats({ 1: 1 }) }))
      .toEqual({ level: 1, variant: 1, escalated: false });
    expect(decideTutorLevel({ key: "OPEN_CIRCUIT", currentDigest: "x", previous: { level: 1, labDigest: "x" }, sameLevelRepeats: repeats({ 1: 2 }) }))
      .toEqual({ level: 1, variant: 0, escalated: false });
    expect(decideTutorLevel({ key: "OPEN_CIRCUIT", currentDigest: "z", previous: { level: 4, labDigest: "x" }, sameLevelRepeats: repeats({ 4: 1 }) }))
      .toEqual({ level: 4, variant: 1, escalated: false });
  });
});
