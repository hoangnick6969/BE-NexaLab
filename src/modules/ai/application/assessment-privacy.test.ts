import { describe, expect, it } from "vitest";
import {
  assertProviderPayloadSafe,
  HIDDEN_TOKEN,
  PrivacyGuardError,
  redact,
  residualIdentifiers,
  STUDENT_TOKEN,
  toOriginalRange,
  type AssessPromptPayload,
  type KnownIdentities,
} from "./assessment-privacy";
import { buildAssessSnapshot } from "./assessment-snapshot";

/** TAI2-T0 privacy contract: redaction with an offset map and the fail-closed provider payload guard. */
const IDS: KnownIdentities = {
  people: [
    { id: "student-active-cuid1", fullName: "Trần Bảo Ngọc", username: "student.active", email: null },
    { id: "classmate-cuid2", fullName: "Phạm Quốc Huy", username: "huy.pham", email: "huy.pham@example.test" },
  ],
  classNames: ["Pilot Science 8A"],
};

const payload = (response: string, patch: Partial<AssessPromptPayload["prompts"][number]> = {}): AssessPromptPayload => ({
  topic: "KHTN 9 - Tác dụng nhiệt của dòng điện",
  prompts: [{
    promptId: "p1",
    question: "Giải thích vì sao dây tóc nóng sáng.",
    referenceAnswer: "Electron va chạm với ion kim loại.",
    criteria: [{ criterionCode: "GIAI_THICH", description: "Giải thích đúng", maxPoints: 2, anchors: [{ points: 0, description: "Sai" }, { points: 2, description: "Đúng" }] }],
    response,
    ...patch,
  }],
});

describe("TAI2-T0 redaction (redact@1)", () => {
  it("replaces the student's own name, name tokens, username and a classmate's email; keeps an offset map", () => {
    const original = "Em là Trần Bảo Ngọc (student.active). Bạn Huy nói electron va chạm, email huy.pham@example.test.";
    const { text, offsetMap } = redact(original, IDS);
    expect(text).toBe(`Em là ${STUDENT_TOKEN} (${STUDENT_TOKEN}). Bạn ${STUDENT_TOKEN} nói electron va chạm, email ${STUDENT_TOKEN}.`);
    for (const secret of ["Trần", "Ngọc", "student.active", "Huy", "huy.pham"]) expect(text).not.toContain(secret);
    // The quote "electron va chạm" maps back to the same words in the original answer.
    const at = text.indexOf("electron va chạm");
    const range = toOriginalRange(offsetMap, at, at + "electron va chạm".length);
    expect(original.slice(range.start, range.end)).toBe("electron va chạm");
    // A range that touches a token covers the whole original identifier.
    const token = text.indexOf(STUDENT_TOKEN);
    const whole = toOriginalRange(offsetMap, token, token + STUDENT_TOKEN.length);
    expect(original.slice(whole.start, whole.end)).toBe("Trần Bảo Ngọc");
  });

  it("is case-insensitive and whole-word only", () => {
    expect(redact("TRẦN BẢO NGỌC trả lời", IDS).text).toBe(`${STUDENT_TOKEN} trả lời`);
    // "Huyết" contains "Huy" but is another word.
    expect(redact("Huyết áp tăng", IDS).text).toBe("Huyết áp tăng");
  });

  it("hides emails, phone numbers, URLs, identifier numbers and the class name", () => {
    const { text } = redact("Gọi 0912 345 678 hoặc +84912345678, xem https://ví-dụ.vn/a, mã 012345678901, lớp Pilot Science 8A, mail a.b@c.vn.", IDS);
    expect(text).toBe(`Gọi ${HIDDEN_TOKEN} hoặc ${HIDDEN_TOKEN}, xem ${HIDDEN_TOKEN}, mã ${HIDDEN_TOKEN}, lớp ${HIDDEN_TOKEN}, mail ${HIDDEN_TOKEN}.`);
  });

  it("keeps formulas, units and short numbers", () => {
    const source = "Ta có $F_A = d \\cdot V$ = 10000 N/m^3 x 0,002 m^3 = 20 N.";
    expect(redact(source, IDS).text).toBe(source);
  });
});

describe("TAI2-T0 fail-closed provider payload guard", () => {
  it("accepts exactly the AssessPromptPayload with a redacted response", () => {
    const { text } = redact("Em là Trần Bảo Ngọc, electron va chạm với ion.", IDS);
    expect(() => assertProviderPayloadSafe(payload(text), IDS)).not.toThrow();
  });

  it("rejects any extra or identifying field (studentId, className, username, similarity)", () => {
    for (const extra of ["studentId", "className", "username", "enrollmentId", "similarity"]) {
      const bad: any = payload("electron va chạm");
      bad.prompts[0][extra] = "x";
      expect(() => assertProviderPayloadSafe(bad, IDS)).toThrow(PrivacyGuardError);
      const top: any = { ...payload("electron va chạm"), [extra]: "x" };
      expect(() => assertProviderPayloadSafe(top, IDS)).toThrow(/FORBIDDEN_FIELD/);
    }
  });

  it("rejects an unredacted response and an identifier in teacher-authored text", () => {
    expect(() => assertProviderPayloadSafe(payload("Ngọc trả lời: electron va chạm"), IDS)).toThrow(/response:NAME_TOKEN/);
    expect(() => assertProviderPayloadSafe(payload("liên hệ 0912345678"), IDS)).toThrow(/response:PHONE/);
    expect(() => assertProviderPayloadSafe(payload("ok", { question: "Bạn Trần Bảo Ngọc hãy giải thích" }), IDS)).toThrow(/question:KNOWN_NAME/);
    expect(() => assertProviderPayloadSafe(payload("ok", { referenceAnswer: "Xem huy.pham@example.test" }), IDS)).toThrow(/referenceAnswer/);
  });

  it("the error carries field paths and kinds, never the matched text", () => {
    try {
      assertProviderPayloadSafe(payload("Ngọc"), IDS);
      throw new Error("expected a guard error");
    } catch (error) {
      expect(error).toBeInstanceOf(PrivacyGuardError);
      expect((error as Error).message).not.toContain("Ngọc");
    }
  });

  it("name tokens are not applied to teacher text, so ordinary words in the rubric do not trip the guard", () => {
    expect(residualIdentifiers("Bảo toàn năng lượng", IDS, { nameTokens: false })).toEqual([]);
    expect(residualIdentifiers("Bảo toàn năng lượng", IDS, { nameTokens: true })).toEqual(["NAME_TOKEN"]);
  });
});

describe("TAI2-T0 snapshot eligibility", () => {
  const content = { prompts: [{ id: "p1", prompt: "Giải thích vì sao dây tóc nóng sáng.", maxChars: 500, referenceAnswer: "Đáp án", commonPhrases: ["dòng điện"], criteria: [{ code: "GIAI_THICH", description: "Giải thích đúng", maxPoints: 2, anchors: [{ points: 0, description: "Sai" }, { points: 2, description: "Đúng" }] }] }] };

  it("copies only payload fields: no commonPhrases, maxChars or ids", () => {
    const outcome = buildAssessSnapshot({ topic: "Bài học", content, answers: [{ promptId: "p1", text: "Em là Trần Bảo Ngọc. Electron va chạm với ion." }], identities: IDS });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const json = JSON.stringify(outcome.snapshot);
    for (const forbidden of ["commonPhrases", "maxChars", "student-active-cuid1", "Trần", "Pilot Science", "studentId"]) expect(json).not.toContain(forbidden);
    expect(outcome.snapshot.payload.prompts[0].response).toBe(`Em là ${STUDENT_TOKEN}. Electron va chạm với ion.`);
  });

  it("a response that is mostly personal data is ineligible (REDACTION_DOMINANT)", () => {
    const outcome = buildAssessSnapshot({ topic: "Bài học", content, answers: [{ promptId: "p1", text: "Trần Bảo Ngọc, huy.pham@example.test" }], identities: IDS });
    expect(outcome).toMatchObject({ ok: false, detail: "REDACTION_DOMINANT" });
  });

  it("an identifier in teacher-authored text makes the submission ineligible (IDENTIFIER_IN_PAYLOAD)", () => {
    const named = { prompts: [{ ...content.prompts[0], referenceAnswer: "Như bài của Phạm Quốc Huy" }] };
    const outcome = buildAssessSnapshot({ topic: "Bài học", content: named, answers: [{ promptId: "p1", text: "Electron va chạm với ion." }], identities: IDS });
    expect(outcome).toMatchObject({ ok: false, detail: "IDENTIFIER_IN_PAYLOAD" });
  });
});
