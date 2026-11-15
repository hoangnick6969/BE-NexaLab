import { examTotalRaw, type ExamComponents } from "./exam-contract";
import { latestSubmission, submissionStatus, TEST_CONTENT_TYPE } from "./assignment-test-contract";
import { isGraded, toScale10 } from "./assessment-policy";

/**
 * TAI-07 (TAI7-T3): pure class gradebook. Rows follow the Vietnamese class-list order (given name, then full name), every
 * score is on the 10-point scale (half-up, one decimal, from raw points) and nothing here reads or writes the database.
 */
export type GradebookStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "AWAITING_GRADE"
  | "LATE_REVIEW_PENDING"
  | "GRADED"
  | "ZERO_REJECTED"
  | "ABSENT";

/** Rows that keep the column from being locked: work still running or waiting for the teacher. */
export const LOCK_BLOCKING: GradebookStatus[] = ["NOT_STARTED", "IN_PROGRESS", "AWAITING_GRADE", "LATE_REVIEW_PENDING"];

export type GradebookStudent = { id: string; fullName: string; username: string | null };
export type GradebookSubmission = {
  id: string;
  studentId: string;
  submittedAt: Date;
  timing: string;
  correctCount: number | null;
  questionCount: number;
  resourceVersion: number;
  sessionId?: string | null;
  examComponents?: ExamComponents | null;
  autoSubmitted?: boolean;
  decision?: { decision: string; createdAt: Date } | null;
  /** Newest first. */
  gradeDecisions?: Array<{ id: string; kind: string; totalPoints: number; maxPoints: number; createdAt: Date }>;
};
export type GradebookSession = { id: string; studentId: string; attemptNo: number; startedAt: Date; expiresAt: Date; status: string };
export type AiSuggestionSummary = { suggestionId: string; status: "VALID" | "PARTIAL" | "SUPPRESSED"; suggestedPoints: number | null; maxPoints: number | null };
export type SimilarityFlag = { level: "HIGH" | "ELEVATED"; matchId: string; reviewed: boolean; otherStudentId: string };

export type GradebookInput = {
  assignment: { id: string; contentType: string; assessmentType?: string | null; dueAt: Date | null };
  students: GradebookStudent[];
  submissions: GradebookSubmission[];
  sessions: GradebookSession[];
  /** Keyed by submission id (current submissions only). */
  suggestions: Map<string, AiSuggestionSummary>;
  similarity: Map<string, SimilarityFlag>;
  now: Date;
};

const collator = new Intl.Collator("vi", { sensitivity: "base" });
const givenName = (fullName: string) => fullName.trim().split(/\s+/).at(-1) ?? "";
/** Vietnamese class lists sort by given name (the last word), then by the full name, then by username. */
export function classListOrder<T extends { fullName: string; username?: string | null; id: string }>(students: T[]): T[] {
  return [...students].sort(
    (a, b) =>
      collator.compare(givenName(a.fullName), givenName(b.fullName)) ||
      collator.compare(a.fullName, b.fullName) ||
      collator.compare(a.username ?? "", b.username ?? "") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Mean of 10-point scores, half-up to one decimal (null when empty). */
export const average10 = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10 + 1e-9) / 10 : null);

export function buildGradebookRows(input: GradebookInput) {
  const graded = isGraded(input.assignment.assessmentType);
  const isTest = input.assignment.contentType === TEST_CONTENT_TYPE;
  const pastDue = !!input.assignment.dueAt && input.now.getTime() > input.assignment.dueAt.getTime();
  return classListOrder(input.students).map((student, index) => {
    const own = input.submissions.filter((s) => s.studentId === student.id);
    const sessions = input.sessions.filter((s) => s.studentId === student.id).sort((a, b) => a.attemptNo - b.attemptNo);
    const current = latestSubmission(own);
    const openSession = sessions.find((s) => s.status === "OPEN") ?? null;
    let status: GradebookStatus;
    let mcq10: number | null = null;
    let lab10: number | null = null;
    let written10: number | null = null;
    let rawPoints: number | null = null;
    let maxPoints: number | null = null;
    const grade = current?.gradeDecisions?.[0] ?? null;
    if (openSession) status = "IN_PROGRESS";
    else if (!current) status = pastDue ? "ABSENT" : "NOT_STARTED";
    else {
      const st = submissionStatus({ timing: current.timing, decision: current.decision ?? null });
      if (st === "LATE_REVIEW_PENDING") status = "LATE_REVIEW_PENDING";
      else if (st === "REJECTED_ZERO") {
        status = "ZERO_REJECTED";
        rawPoints = 0;
        maxPoints = isTest ? current.questionCount : grade?.maxPoints ?? null;
      } else if (current.examComponents) {
        const components = current.examComponents;
        mcq10 = toScale10(components.mcqUnits / 100, 10);
        lab10 = toScale10(components.labUnits / 100, 10);
        written10 = grade ? toScale10(grade.totalPoints, 10) : null;
        rawPoints = examTotalRaw(components, grade?.totalPoints);
        maxPoints = 10;
        status = rawPoints === null ? "AWAITING_GRADE" : "GRADED";
      } else if (isTest) {
        status = "GRADED";
        rawPoints = current.correctCount ?? 0;
        maxPoints = current.questionCount;
        mcq10 = toScale10(rawPoints, maxPoints);
      } else if (grade) {
        status = "GRADED";
        rawPoints = grade.totalPoints;
        maxPoints = grade.maxPoints;
        written10 = toScale10(rawPoints, maxPoints);
      } else status = "AWAITING_GRADE";
    }
    const total10 = status === "ZERO_REJECTED" ? 0 : status === "GRADED" ? (current?.examComponents ? toScale10(rawPoints!, 10) : mcq10 ?? written10) : null;
    const session = current?.sessionId ? sessions.find((s) => s.id === current.sessionId) ?? null : null;
    const ai = current ? input.suggestions.get(current.id) ?? null : null;
    const suggested10 = ai && ai.status === "VALID" && ai.suggestedPoints !== null && ai.maxPoints ? toScale10(ai.suggestedPoints, current?.examComponents ? 10 : ai.maxPoints) : null;
    const canQuickApprove = !isTest && status === "AWAITING_GRADE" && ai?.status === "VALID";
    return {
      index: index + 1,
      student: { id: student.id, fullName: student.fullName, username: student.username },
      status,
      submissionId: current?.id ?? null,
      submittedAt: current?.submittedAt ?? null,
      autoSubmitted: !!current?.autoSubmitted,
      timeUsedSeconds: session && current ? Math.max(0, Math.round((current.submittedAt.getTime() - session.startedAt.getTime()) / 1000)) : null,
      attempts: graded ? { used: sessions.length, open: !!openSession } : null,
      mcq10,
      lab10,
      written10,
      rawPoints,
      maxPoints,
      total10,
      grade: grade ? { id: grade.id, kind: grade.kind, gradedAt: grade.createdAt } : null,
      ai: ai ? { suggestionId: ai.suggestionId, status: ai.status, suggested10, canQuickApprove } : null,
      similarity: current ? input.similarity.get(current.id) ?? null : null,
    };
  });
}

export type GradebookRow = ReturnType<typeof buildGradebookRows>[number];

export function gradebookSummary(rows: GradebookRow[]) {
  const count = (statuses: GradebookStatus[]) => rows.filter((r) => statuses.includes(r.status)).length;
  const scored = rows.filter((r) => r.total10 !== null).map((r) => r.total10!);
  return {
    students: rows.length,
    submitted: count(["AWAITING_GRADE", "LATE_REVIEW_PENDING", "GRADED", "ZERO_REJECTED"]),
    absent: count(["ABSENT"]),
    inProgress: count(["IN_PROGRESS"]),
    notStarted: count(["NOT_STARTED"]),
    graded: count(["GRADED", "ZERO_REJECTED"]),
    awaitingGrade: count(["AWAITING_GRADE", "LATE_REVIEW_PENDING"]),
    aiReady: rows.filter((r) => r.ai?.canQuickApprove).length,
    similarityFlags: rows.filter((r) => r.similarity).length,
    similarityUnreviewed: rows.filter((r) => r.similarity && !r.similarity.reviewed).length,
    average10: average10(scored),
    min10: scored.length ? Math.min(...scored) : null,
    max10: scored.length ? Math.max(...scored) : null,
  };
}

/** Rows that stop a lock, with the reason the teacher must resolve first. */
export const lockBlockers = (rows: GradebookRow[]) =>
  rows.filter((r) => LOCK_BLOCKING.includes(r.status)).map((r) => ({ studentId: r.student.id, fullName: r.student.fullName, status: r.status }));

/** Snapshot status written on lock. */
export const entryStatus = (row: GradebookRow): "GRADED" | "ABSENT" | "ZERO_REJECTED" =>
  row.status === "ABSENT" ? "ABSENT" : row.status === "ZERO_REJECTED" ? "ZERO_REJECTED" : "GRADED";

// ---------- CSV (Excel-ready) ----------

export type CsvFormat = "vn" | "standard";
export type CsvEntry = { index: number; username: string | null; fullName: string; status: string; score10: number | null };

/**
 * "vn": `;` between columns and a decimal comma, which Excel opens directly on Vietnamese regional settings.
 * "standard": `,` between columns and a decimal point. Both start with the UTF-8 BOM so Excel reads Vietnamese
 * names correctly, use CRLF line ends and neutralize cells that a spreadsheet would run as a formula.
 */
export function gradebookCsv(entries: CsvEntry[], format: CsvFormat = "vn") {
  const sep = format === "vn" ? ";" : ",";
  const cell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /["\r\n;,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const score = (value: number | null) => (value === null ? "" : format === "vn" ? value.toFixed(1).replace(".", ",") : value.toFixed(1));
  const note = (status: string) => (status === "ABSENT" ? "Vắng" : status === "ZERO_REJECTED" ? "Bài nộp trễ bị từ chối (0 điểm)" : "");
  const lines = [
    ["STT", "Tên đăng nhập", "Họ và tên", "Điểm", "Ghi chú"].join(sep),
    ...entries.map((e) => [String(e.index), cell(e.username ?? ""), cell(e.fullName), score(e.score10), cell(note(e.status))].join(sep)),
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** ASCII-safe file name plus an RFC 5987 UTF-8 name for the Content-Disposition header. */
export function csvFileName(title: string, lockVersion: number) {
  const base = `So-diem-${title}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
  const utf8 = `Sổ điểm - ${title}${lockVersion > 1 ? ` (lần chốt ${lockVersion})` : ""}.csv`;
  return { ascii: `${base}${lockVersion > 1 ? `-v${lockVersion}` : ""}.csv`, utf8 };
}
