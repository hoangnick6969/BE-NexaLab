import { describe, expect, it } from "vitest";
import { buildInputSnapshot, buildPassages, MAX_PASSAGE_CHARS, MAX_PASSAGES, selectOutcomes, snapshotDigest, type LessonSource } from "./input-snapshot";

const lesson = (patch: Partial<LessonSource> = {}): LessonSource => ({
  id: "lesson-circuit", title: "Mạch điện", grade: 8, domain: "ENERGY", topic: "Dòng điện",
  learningObjective: "Hiểu dòng điện.", content: "<p>Đoạn một.</p><p>Đoạn hai.</p>", outcomeCodes: ["KHTN8.E1", "KHTN8.E2"],
  readingSteps: [{ position: 3, html: "<p>Đọc sau</p>" }, { position: 1, html: "<h2>Đọc trước</h2>" }],
  ...patch,
});
const request = { targetKind: "TEST", itemCount: 5, difficulty: null, outcomeCodes: null, instruction: null };
const statements = new Map([["KHTN8.E1", "Mô tả dòng điện"], ["KHTN8.E2", "Đo cường độ"]]);

describe("buildPassages", () => {
  it("orders learningObjective, content, then READING steps by position, numbered P1..Pn", () => {
    const passages = buildPassages(lesson());
    expect(passages.map((p) => p.id)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(passages.map((p) => p.text)).toEqual(["Hiểu dòng điện.", "Đoạn một.\nĐoạn hai.", "Đọc trước", "Đọc sau"]);
  });

  it("strips tags and collapses whitespace like textOf, keeping Vietnamese text", () => {
    const [, content] = buildPassages(lesson({ content: "<p>Điện   <b>trở</b>\n là</p>" }));
    expect(content.text).toBe("Điện trở là");
  });

  it("never lets a passage span two sources and skips empty sources", () => {
    const passages = buildPassages(lesson({ learningObjective: "A", content: "  <p> </p> ", readingSteps: [{ position: 1, html: "B" }] }));
    expect(passages.map((p) => p.text)).toEqual(["A", "B"]);
  });

  it("packs paragraphs up to the limit and splits over-long paragraphs at a space", () => {
    const word = "điện ".repeat(400).trim();
    const passages = buildPassages(lesson({ learningObjective: "", content: `<p>${word}</p>`, readingSteps: [] }));
    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) expect(passage.text.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS);
    expect(passages.map((p) => p.text).join(" ")).toBe(word);
  });

  it("hard-cuts a paragraph without spaces", () => {
    const passages = buildPassages(lesson({ learningObjective: "", content: "x".repeat(2500), readingSteps: [] }));
    expect(passages.map((p) => p.text.length)).toEqual([1200, 1200, 100]);
  });

  it("keeps at most 40 passages in source order", () => {
    const steps = Array.from({ length: 60 }, (_, i) => ({ position: i, html: `S${i}` }));
    const passages = buildPassages(lesson({ readingSteps: steps }));
    expect(passages).toHaveLength(MAX_PASSAGES);
    expect(passages[2].text).toBe("S0");
  });
});

describe("selectOutcomes and snapshot", () => {
  it("uses requested codes when given, else the lesson's codes, dropping codes without a statement", () => {
    expect(selectOutcomes(lesson(), ["KHTN8.E2"], statements)).toEqual([{ code: "KHTN8.E2", statement: "Đo cường độ" }]);
    expect(selectOutcomes(lesson(), null, statements).map((o) => o.code)).toEqual(["KHTN8.E1", "KHTN8.E2"]);
    expect(selectOutcomes(lesson({ outcomeCodes: ["UNKNOWN"] }), null, statements)).toEqual([]);
  });

  it("gives the same digest for the same lesson state and a different one after an edit", () => {
    const a = snapshotDigest(buildInputSnapshot(lesson(), request, statements));
    const b = snapshotDigest(buildInputSnapshot(lesson(), { ...request }, new Map(statements)));
    const c = snapshotDigest(buildInputSnapshot(lesson({ content: "<p>Đoạn mới.</p>" }), request, statements));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("carries constraints and instruction from the request", () => {
    const snapshot = buildInputSnapshot(lesson(), { ...request, difficulty: "ADVANCED", instruction: "Tập trung đơn vị" }, statements);
    expect(snapshot.constraints).toEqual({ targetKind: "TEST", itemCount: 5, difficulty: "ADVANCED" });
    expect(snapshot.instruction).toBe("Tập trung đơn vị");
    expect(snapshot.lesson).toEqual({ id: "lesson-circuit", title: "Mạch điện", grade: 8, domain: "ENERGY", topic: "Dòng điện", learningObjective: "Hiểu dòng điện." });
  });
});
