import { describe, expect, it } from "vitest";
import type { InputSnapshotV1 } from "./generate-resource-prompt";
import { processGenerateResourceOutput } from "./output-pipeline";
import { jaccard, normalizeText, trigrams, type CardItem, type QuestionItem } from "./resource-items";
import { contentFlags, dropReasons, structuralDropReasons, validateItems } from "./validate-items";

const snapshot = (patch: Partial<InputSnapshotV1["constraints"]> = {}): InputSnapshotV1 => ({
  lesson: { id: "lesson-circuit", title: "Mạch điện", grade: 8, domain: "ENERGY", topic: "Dòng điện", learningObjective: "x" },
  passages: [{ id: "P1", text: "a" }, { id: "P2", text: "b" }],
  outcomes: [{ code: "KHTN8.E1", statement: "s" }],
  constraints: { targetKind: "TEST", itemCount: 10, difficulty: null, ...patch },
  instruction: null,
});
const q = (patch: Partial<QuestionItem> = {}): QuestionItem => ({
  type: "SINGLE_CHOICE", prompt: "Dụng cụ nào dùng để đo cường độ dòng điện", options: ["Ampe kế", "Vôn kế", "Nhiệt kế", "Lực kế"],
  correctOption: 0, explanation: "Ampe kế mắc nối tiếp để đo cường độ dòng điện.", difficulty: "STANDARD", outcomeCodes: ["KHTN8.E1"], sourceRefs: ["P1"], ...patch,
});
const card = (patch: Partial<CardItem> = {}): CardItem => ({ type: "CARD", front: "Ampe kế", back: "Dụng cụ đo cường độ dòng điện", sourceRefs: ["P2"], ...patch });
const reasons = (item: any, s = snapshot()) => dropReasons(item, s);

describe("normalize", () => {
  it("lowercases, collapses whitespace, strips trailing punctuation and unifies symbols", () => {
    expect(normalizeText("  Dòng   ĐIỆN là gì?? ")).toBe("dòng điện là gì");
    expect(normalizeText("2 × 3 − 1 = ５")).toBe("2 x 3 - 1 = 5");
  });
  it("keeps Vietnamese diacritics (lực and lúc stay distinct)", () => {
    expect(normalizeText("lực")).not.toBe(normalizeText("lúc"));
  });
});

describe("drop rules (one pass and one fail each)", () => {
  it("VR-01 item type must match the target kind family", () => {
    expect(reasons(q())).toEqual([]);
    expect(reasons(card())).toEqual(["ITEM_TYPE_MISMATCH"]);
    expect(reasons(card(), snapshot({ targetKind: "DECK" }))).toEqual([]);
    expect(reasons(q(), snapshot({ targetKind: "DECK" }))).toEqual(["ITEM_TYPE_MISMATCH"]);
    expect(reasons(q(), snapshot({ targetKind: "STUDY_QUIZ" }))).toEqual([]);
  });

  it("VR-02 length limits", () => {
    expect(reasons(q({ prompt: "x".repeat(500) }))).toEqual([]);
    expect(reasons(q({ prompt: "x".repeat(501) }))).toContain("LENGTH_INVALID");
    expect(reasons(q({ prompt: "   " }))).toContain("LENGTH_INVALID");
    expect(reasons(q({ options: ["Ampe kế", "y".repeat(501)] }))).toContain("LENGTH_INVALID");
    expect(reasons(q({ explanation: "z".repeat(1000) }))).toEqual([]);
    expect(reasons(q({ explanation: "z".repeat(1001) }))).toContain("LENGTH_INVALID");
    expect(reasons(q({ explanation: "" }))).toContain("LENGTH_INVALID");
    expect(reasons(card({ back: "" }), snapshot({ targetKind: "DECK" }))).toContain("LENGTH_INVALID");
  });

  it("VR-03 2-6 options and an integer key of an existing option", () => {
    expect(reasons(q({ options: ["A1", "B1"], correctOption: 1 }))).toEqual([]);
    expect(reasons(q({ options: ["A1"], correctOption: 0 }))).toContain("ANSWER_KEY_INVALID");
    expect(reasons(q({ options: ["a", "b", "c", "d", "e", "f", "g"] }))).toContain("ANSWER_KEY_INVALID");
    expect(reasons(q({ correctOption: 4 }))).toContain("ANSWER_KEY_INVALID");
    expect(reasons(q({ correctOption: -1 }))).toContain("ANSWER_KEY_INVALID");
    expect(reasons(q({ correctOption: 1.5 }))).toContain("ANSWER_KEY_INVALID");
  });

  it("VR-04 options pairwise distinct after normalize, diacritics kept", () => {
    expect(reasons(q({ options: ["Ampe kế", "ampe   kế.", "Vôn kế"] }))).toContain("OPTIONS_NOT_DISTINCT");
    expect(reasons(q({ options: ["lực", "lúc", "Vôn kế"] }))).toEqual([]);
  });

  it("VR-05 forbids all/none-of-the-above options", () => {
    for (const option of ["Tất cả các đáp án trên", "Tất cả đều đúng", "Cả A và B", "Không có đáp án nào đúng", "None of the above"])
      expect(reasons(q({ options: ["Ampe kế", "Vôn kế", option] }))).toContain("OPTION_PATTERN_FORBIDDEN");
    expect(reasons(q({ options: ["Ampe kế", "Vôn kế", "Tất cả các vật dẫn điện"] }))).toEqual([]);
  });

  it("VR-06 sourceRefs must be non-empty and exist in the snapshot", () => {
    expect(reasons(q({ sourceRefs: ["P1", "P2"] }))).toEqual([]);
    expect(reasons(q({ sourceRefs: [] }))).toContain("GROUNDING_REF_INVALID");
    expect(reasons(q({ sourceRefs: ["P9"] }))).toContain("GROUNDING_REF_INVALID");
    expect(reasons(card({ sourceRefs: ["P3"] }), snapshot({ targetKind: "DECK" }))).toContain("GROUNDING_REF_INVALID");
  });

  it("VR-07 outcomeCodes must be a subset of the snapshot outcomes", () => {
    expect(reasons(q({ outcomeCodes: [] }))).toEqual([]);
    expect(reasons(q({ outcomeCodes: ["KHTN9.X"] }))).toContain("OUTCOME_INVALID");
  });

  it("VR-08 rejects real-world hazardous procedures", () => {
    expect(reasons(q({ explanation: "Hãy tự chế mạch và cắm vào điện lưới để thử." }))).toContain("SAFETY_REJECTED");
    expect(reasons(q({ options: ["Nếm thử dung dịch", "Vôn kế"] }))).toContain("SAFETY_REJECTED");
    expect(reasons(card({ back: "Cắm trực tiếp vào ổ cắm điện" }), snapshot({ targetKind: "DECK" }))).toContain("SAFETY_REJECTED");
    expect(reasons(q())).toEqual([]);
  });

  it("collects every failing reason of one item", () => {
    expect(reasons(q({ prompt: "", sourceRefs: [], outcomeCodes: ["X"] })).sort()).toEqual(["GROUNDING_REF_INVALID", "LENGTH_INVALID", "OUTCOME_INVALID"]);
  });

  it("structural rules for edited payloads exclude grounding and outcomes", () => {
    expect(structuralDropReasons(q({ sourceRefs: [], outcomeCodes: ["X"] }))).toEqual([]);
    expect(structuralDropReasons(q({ correctOption: 9 }))).toEqual(["ANSWER_KEY_INVALID"]);
  });

  it("VR-10 drops survivors beyond the requested count", () => {
    const items = [q({ prompt: "Câu một khác hẳn" }), q({ sourceRefs: [] }), q({ prompt: "Câu hai riêng biệt" }), q({ prompt: "Câu ba độc lập nữa" })];
    const result = validateItems(snapshot({ itemCount: 2 }), items, []);
    expect(result.items.map((i) => i.position)).toEqual([0, 2]);
    expect(result.dropped).toEqual([{ position: 1, reasonCodes: ["GROUNDING_REF_INVALID"] }, { position: 3, reasonCodes: ["OVER_COUNT"] }]);
  });
});

describe("warning flags", () => {
  // Distinct characters: n chars give n-2 distinct trigrams, so a prefix shares exactly its own trigrams.
  const alphabet = "abcdefghijklmnopqrstuvwxyz0";
  it("VW-02 trigram Jaccard boundary: 0.85 flags, 0.84 does not", () => {
    const a85 = alphabet.slice(0, 22), b85 = alphabet.slice(0, 19); // 17 / 20
    const a84 = alphabet.slice(0, 27), b84 = alphabet.slice(0, 23); // 21 / 25
    expect(jaccard(trigrams(a85), trigrams(b85))).toBe(0.85);
    expect(jaccard(trigrams(a84), trigrams(b84))).toBe(0.84);
    expect(validateItems(snapshot(), [q({ prompt: b85 })], [a85]).items[0].flags).toContain("NEAR_DUPLICATE");
    expect(validateItems(snapshot(), [q({ prompt: b84 })], [a84]).items[0].flags).not.toContain("NEAR_DUPLICATE");
  });

  it("VW-01 exact duplicate on case and whitespace differences, never on diacritic-only differences", () => {
    expect(validateItems(snapshot(), [q({ prompt: "  DỤNG cụ nào dùng để đo   cường độ dòng điện? " })], [q().prompt]).items[0].flags).toContain("EXACT_DUPLICATE");
    expect(validateItems(snapshot(), [q({ prompt: "lực" })], ["lúc"]).items[0].flags).not.toContain("EXACT_DUPLICATE");
    expect(validateItems(snapshot({ targetKind: "DECK" }), [card()], ["ampe kế"]).items[0].flags).toContain("EXACT_DUPLICATE");
  });

  it("duplicates are warnings only: the item is kept", () => {
    const result = validateItems(snapshot(), [q()], [q().prompt]);
    expect(result.items).toHaveLength(1);
    expect(result.dropped).toEqual([]);
  });

  it("VW-07 batch duplicates flag the later item; VW-02 flags both near items", () => {
    const result = validateItems(snapshot(), [q(), q({ prompt: q().prompt.toUpperCase() }), q({ prompt: "Hoàn toàn khác biệt về nội dung" })], []);
    expect(result.items[0].flags).toEqual(["NEAR_DUPLICATE"]);
    expect(result.items[1].flags).toEqual(["NEAR_DUPLICATE", "BATCH_DUPLICATE"]);
    expect(result.items[2].flags).toEqual([]);
  });

  it("VW-03 numeric review needs a digit with an operator, percent or unit", () => {
    expect(contentFlags(q({ prompt: "Điện trở 10 Ω mắc vào hiệu điện thế 6 V" }), null)).toContain("NUMERIC_REVIEW");
    expect(contentFlags(q({ options: ["I = 2", "Vôn kế"] }), null)).toContain("NUMERIC_REVIEW");
    expect(contentFlags(q({ options: ["50%", "Vôn kế"] }), null)).toContain("NUMERIC_REVIEW");
    expect(contentFlags(q({ prompt: "Chương 2 nói về gì" }), null)).not.toContain("NUMERIC_REVIEW");
    expect(contentFlags(q({ prompt: "Đơn vị V là gì" }), null)).not.toContain("NUMERIC_REVIEW");
  });

  it("VW-04 answer length cue only when the key is longest and at least 1.5x the mean", () => {
    expect(contentFlags(q({ options: ["Ampe kế mắc nối tiếp trong mạch", "Vôn kế", "Nhiệt kế"] }), null)).toContain("ANSWER_LENGTH_CUE");
    expect(contentFlags(q({ options: ["Ampe kế", "Vôn kế", "Nhiệt kế"] }), null)).not.toContain("ANSWER_LENGTH_CUE");
  });

  it("VW-05 negative stem and VW-06 difficulty mismatch", () => {
    expect(contentFlags(q({ prompt: "Phát biểu nào sau đây KHÔNG đúng" }), null)).toContain("NEGATIVE_STEM");
    expect(contentFlags(q({ prompt: "Chọn phát biểu sai" }), null)).toContain("NEGATIVE_STEM");
    expect(contentFlags(q(), null)).not.toContain("NEGATIVE_STEM");
    expect(contentFlags(q({ difficulty: "ADVANCED" }), "FOUNDATION")).toContain("DIFFICULTY_MISMATCH");
    expect(contentFlags(q({ difficulty: "FOUNDATION" }), "FOUNDATION")).not.toContain("DIFFICULTY_MISMATCH");
    expect(contentFlags(q(), null)).not.toContain("DIFFICULTY_MISMATCH");
  });
});

describe("processGenerateResourceOutput", () => {
  const text = (items: unknown[]) => JSON.stringify({ items });

  it("fails OUTPUT_SCHEMA_INVALID for non-JSON, extra keys, wrong types or unknown item type", () => {
    for (const bad of ["not json", "[]", '{"items":{}}', text([{ ...q(), extra: 1 }]), text([{ ...q(), correctOption: "0" }]), text([{ type: "ESSAY" }]), JSON.stringify({ items: [], note: "x" })])
      expect(processGenerateResourceOutput(snapshot(), bad)).toMatchObject({ ok: false, code: "OUTPUT_SCHEMA_INVALID" });
  });

  it("fails OUTPUT_VALIDATION_FAILED with dropped reasons when no item survives", () => {
    expect(processGenerateResourceOutput(snapshot(), text([q({ sourceRefs: [] }), card()]))).toEqual({
      ok: false, code: "OUTPUT_VALIDATION_FAILED",
      dropped: [{ position: 0, reasonCodes: ["GROUNDING_REF_INVALID"] }, { position: 1, reasonCodes: ["ITEM_TYPE_MISMATCH"] }],
    });
    expect(processGenerateResourceOutput(snapshot(), text([]))).toMatchObject({ ok: false, code: "OUTPUT_VALIDATION_FAILED" });
  });

  it("keeps valid items with flags and lists dropped reasons on partial validity", () => {
    const result = processGenerateResourceOutput(snapshot(), text([q(), q({ prompt: "Chọn phát biểu sai", correctOption: 7 })]), ["dụng cụ nào dùng để đo cường độ dòng điện"]);
    expect(result).toEqual({ ok: true, items: [{ payload: q(), flags: ["EXACT_DUPLICATE", "NEAR_DUPLICATE"] }], dropped: [{ position: 1, reasonCodes: ["ANSWER_KEY_INVALID"] }] });
  });
});
