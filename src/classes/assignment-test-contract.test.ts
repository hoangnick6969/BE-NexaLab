import { describe, expect, it } from "vitest";
import {
  assertTestAssignmentUpdate,
  DUE_SOON_MS,
  requireTestDueDate,
  scoreTest,
  studentTestContent,
  studentTestState,
  submissionView,
  testSubmissionSchema,
} from "./assignment-test-contract";

describe("assigned test contract", () => {
  it("requires a due date", () => {
    expect(() => requireTestDueDate(null)).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: "DUE_DATE_REQUIRED" }) }));
    const due = new Date("2026-11-01T10:00:00.000Z");
    expect(requireTestDueDate(due)).toBe(due);
  });

  it("keeps targets and due date out of the general update", () => {
    const due = new Date("2026-11-01T10:00:00.000Z");
    expect(() => assertTestAssignmentUpdate({ studentIds: ["s1"] }, due)).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: "TEST_ASSIGNMENT_IMMUTABLE" }) }));
    expect(() => assertTestAssignmentUpdate({ dueDate: "2026-11-02T10:00:00.000Z" }, due)).toThrow();
    expect(() => assertTestAssignmentUpdate({ dueDate: null }, due)).toThrow();
    expect(() => assertTestAssignmentUpdate({ dueDate: due.toISOString() }, due)).not.toThrow();
    expect(() => assertTestAssignmentUpdate({}, due)).not.toThrow();
  });

  it("strips answer keys and explanations from the student copy", () => {
    const content = {
      questions: [{ id: "q1", prompt: "2 + 2?", explanation: "Bằng 4", correctOption: 1, options: [{ id: "a", text: "3" }, { id: "b", text: "4" }] }],
    };
    expect(studentTestContent(content)).toEqual({ questions: [{ id: "q1", prompt: "2 + 2?", options: [{ id: "a", text: "3" }, { id: "b", text: "4" }] }] });
  });
});

const test = {
  questions: [
    { id: "q1", correctOption: 1, options: [{ id: "a" }, { id: "b" }] },
    { id: "q2", correctOption: 0, options: [{ id: "c" }, { id: "d" }] },
  ],
};
const due = new Date("2026-11-01T10:00:00.000Z");
const row = (over: any = {}) => ({
  id: "s1",
  timing: "ON_TIME",
  score: 50,
  correctCount: 1,
  questionCount: 2,
  lateReason: null,
  submittedAt: new Date("2026-11-01T09:00:00.000Z"),
  decision: null,
  ...over,
});
const at = (ms: number) => new Date(due.getTime() + ms);

describe("assigned test scoring", () => {
  it("scores on the server from option IDs", () => {
    expect(scoreTest(test, [{ questionId: "q1", optionId: "b" }, { questionId: "q2", optionId: "d" }])).toEqual({ correctCount: 1, questionCount: 2, score: 50 });
    expect(scoreTest(test, [{ questionId: "q2", optionId: "c" }, { questionId: "q1", optionId: "b" }]).score).toBe(100);
  });

  it("rejects missing, repeated or foreign answers", () => {
    const invalid = expect.objectContaining({ response: expect.objectContaining({ code: "TEST_ANSWERS_INVALID" }) });
    expect(() => scoreTest(test, [{ questionId: "q1", optionId: "b" }])).toThrow(invalid);
    expect(() => scoreTest(test, [{ questionId: "q1", optionId: "b" }, { questionId: "q1", optionId: "a" }])).toThrow(invalid);
    expect(() => scoreTest(test, [{ questionId: "q1", optionId: "c" }, { questionId: "q2", optionId: "c" }])).toThrow(invalid);
    expect(() => scoreTest(test, [{ questionId: "q1", optionId: "b" }, { questionId: "q9", optionId: "c" }])).toThrow(invalid);
  });

  it("does not accept a client-sent status or time", () => {
    expect(() => testSubmissionSchema.parse({ answers: [{ questionId: "q1", optionId: "a" }], submittedAt: due.toISOString() })).toThrow();
  });
});

describe("assigned test status", () => {
  it("hides a pending late score, zeroes a rejection, and keeps an accepted late score", () => {
    expect(submissionView(row({ timing: "LATE", lateReason: "Ốm" }))).toMatchObject({ status: "LATE_REVIEW_PENDING", score: null, correctCount: null });
    expect(submissionView(row({ timing: "LATE", decision: { decision: "REJECT_ZERO", createdAt: due } }))).toMatchObject({ status: "REJECTED_ZERO", score: 0 });
    expect(submissionView(row({ timing: "LATE", decision: { decision: "REVISE_DEADLINE_FOR_CLASS", createdAt: due } }))).toMatchObject({ status: "ACCEPTED_BY_EXTENSION", score: 50 });
  });

  it("derives upcoming, due-soon and overdue without a zero", () => {
    const state = (now: Date) => studentTestState({ dueAt: due, revision: 1, submissions: [], now });
    expect(state(at(-DUE_SOON_MS - 1)).status).toBe("UPCOMING");
    expect(state(at(-DUE_SOON_MS))).toMatchObject({ status: "DUE_SOON", dueSoon: true });
    expect(state(at(0))).toMatchObject({ status: "DUE_SOON", lateReasonRequired: false });
    expect(state(at(1))).toMatchObject({ status: "OVERDUE_UNSUBMITTED", lateReasonRequired: true, current: null });
  });

  it("makes the latest submission current and keeps history newest first", () => {
    const first = row({ id: "s1", score: 100, submittedAt: at(-3600_000) });
    const late = row({ id: "s2", timing: "LATE", lateReason: "Mất mạng", submittedAt: at(3600_000) });
    const state = studentTestState({ dueAt: due, revision: 1, submissions: [first, late], now: at(7200_000) });
    expect(state.status).toBe("LATE_REVIEW_PENDING");
    expect(state.current).toMatchObject({ id: "s2", score: null });
    expect(state.history.map((h) => h.id)).toEqual(["s2", "s1"]);
  });

  it("flags an extension and reports a rejected current submission", () => {
    const rejected = row({ timing: "LATE", decision: { decision: "REJECT_ZERO", createdAt: due } });
    expect(studentTestState({ dueAt: due, revision: 2, submissions: [rejected], now: at(0) })).toMatchObject({ status: "REJECTED", extended: true });
  });
});
