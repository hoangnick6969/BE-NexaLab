import { describe, expect, it, vi } from "vitest";
import { examSubmissionData } from "./assessment-session";
import { normalizeExam, studentExamContent, type PublishedExam } from "./exam-contract";
import { buildGradebookRows, lockBlockers } from "./gradebook";

const mcq = { prompt: "Dòng điện chạy khi nào?", options: ["Mạch kín", "Mạch hở"], correctOption: 0, points: 3.04, cognitiveLevel: "RECALL" };
const written = {
  prompt: "Giải thích tác dụng nhiệt.", maxChars: 1000, points: 4, cognitiveLevel: "UNDERSTAND",
  referenceAnswer: "Điện năng chuyển hóa thành nhiệt năng", commonPhrases: ["tác dụng nhiệt"],
  criteria: [{ code: "NHIET", description: "Giải thích hiện tượng", maxPoints: 4, anchors: [{ points: 0, description: "Sai" }, { points: 4, description: "Đúng" }] }],
};
const lab = { labId: "circuit", releaseId: "release", challengeId: "challenge", prompt: "Lắp mạch điện.", points: 2.96, cognitiveLevel: "APPLY" };

describe("TAI7-T4 composite exam", () => {
  it("requires a mix, an exact 10-point allocation, and matching rubric weight", () => {
    expect(() => normalizeExam({ questions: [mcq], prompts: [written], labs: [{ ...lab, points: 2.95 }] })).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: "EXAM_POINTS_INVALID" }) }));
    expect(() => normalizeExam({ questions: [{ ...mcq, points: 10 }] })).toThrow();
    expect(() => normalizeExam({ questions: [{ ...mcq, points: 7 }], prompts: [{ ...written, points: 3 }] })).toThrow();
    expect(normalizeExam({ questions: [{ ...mcq, points: 7.04 }], labs: [lab] }).prompts).toEqual([]);
    expect(normalizeExam({ prompts: [written], labs: [{ ...lab, points: 6 }] }).questions).toEqual([]);
    expect(normalizeExam({ questions: [{ ...mcq, points: 6 }], prompts: [written] }).labs).toEqual([]);
  });

  it("projects only fields needed to answer each item", () => {
    const paper = normalizeExam({ questions: [{ ...mcq, explanation: "key" }], prompts: [written], labs: [lab] });
    const view = studentExamContent(paper as PublishedExam);
    expect(JSON.stringify(view)).not.toMatch(/correctOption|explanation|anchors|referenceAnswer|commonPhrases|execution|releaseId/);
    expect(view.questions[0]).toMatchObject({ points: 3.04, cognitiveLevel: "RECALL" });
    expect(view.prompts[0].criteria[0]).toMatchObject({ code: "NHIET", maxPoints: 4 });
  });

  it("takes only session-bound official Lab attempts and awards each passed item once", async () => {
    const paper = normalizeExam({ questions: [mcq], prompts: [written], labs: [lab] }) as PublishedExam;
    const item = paper.labs[0].id;
    const findMany = vi.fn().mockResolvedValue([
      { id: "one", verdict: "partial", labRun: { examItemId: item } },
      { id: "two", verdict: "passed", labRun: { examItemId: item } },
      { id: "three", verdict: "passed", labRun: { examItemId: item } },
      { id: "unrelated", verdict: "passed", labRun: { examItemId: "different-item" } },
    ]);
    const startedAt = new Date();
    const expiresAt = new Date(+startedAt + 900_000);
    const scored = await examSubmissionData({ attempt: { findMany } }, { id: "session", studentId: "student", startedAt, expiresAt }, paper, {
      choices: [{ questionId: paper.questions[0].id, optionId: paper.questions[0].options[0].id }],
      responses: [{ promptId: paper.prompts[0].id, text: " Giải thích. " }],
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      studentId: "student", labRun: { assessmentSessionId: "session", context: "EXAM" },
      createdAt: { gte: startedAt, lte: expiresAt },
    } }));
    expect(scored).toMatchObject({
      gradingMode: "MIXED", score: null, answers: [{ text: "Giải thích." }],
      examComponents: { mcqUnits: 304, labUnits: 296, writtenRequired: true },
    });
    expect(scored.examComponents.attempts).toHaveLength(3);
  });

  it("blocks locking until written grades exist and rounds the aggregate from raw points", () => {
    const now = new Date();
    const submission = {
      id: "sub", studentId: "student", submittedAt: now, timing: "ON_TIME", correctCount: null, questionCount: 3, resourceVersion: 1,
      examComponents: { mcqUnits: 304, labUnits: 294, writtenRequired: true, choices: [], attempts: [] },
    };
    const rows = (graded: boolean, writtenRequired = true) => buildGradebookRows({
      assignment: { id: "exam", contentType: "exam", assessmentType: "REGULAR_15M", dueAt: now },
      students: [{ id: "student", fullName: "Học sinh", username: "student" }],
      submissions: [{ ...submission, examComponents: { ...submission.examComponents, writtenRequired }, gradeDecisions: graded
        ? [{ id: "grade", kind: "MANUAL", totalPoints: 3, maxPoints: 4, createdAt: now }] : [] }],
      sessions: [], suggestions: new Map(), similarity: new Map(), now,
    });
    expect(rows(false)[0]).toMatchObject({ status: "AWAITING_GRADE", mcq10: 3, lab10: 2.9, written10: null, total10: null });
    expect(lockBlockers(rows(false))).toHaveLength(1);
    expect(rows(true)[0]).toMatchObject({ status: "GRADED", written10: 3, rawPoints: 8.98, total10: 9 });
    expect(lockBlockers(rows(true))).toEqual([]);
    expect(rows(false, false)[0]).toMatchObject({ status: "GRADED", total10: 6 });
  });
});
