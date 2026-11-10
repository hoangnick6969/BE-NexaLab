import { ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
import { audit } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { Db } from "../../../db/db";
import { latestSubmission } from "../../classes/application/assignment-test-contract";
import { WRITTEN_CONTENT_TYPE } from "../../classes/application/assignment-written-contract";
import { ownedClass } from "../../classes/application/class-access";
import { classArchived, lock } from "../../classes/application/class-common";
import { computeSubmissionSimilarity, SUBSIM_ALGORITHM_VERSION } from "./submission-similarity";

/** TAI-03 Part B limits (implementation-contract.md): a run is synchronous and bounded. */
export const MIN_RUN_SUBMISSIONS = 2;
export const MAX_RUN_SUBMISSIONS = 200;

const reviewSchema = z
  .object({
    status: z.enum(["NOTED", "DISMISSED"]),
    note: z
      .string()
      .max(4000)
      .transform((value) => value.trim().normalize("NFC"))
      .refine((value) => [...value].length <= 1000, "Ghi chú tối đa 1000 ký tự")
      .optional(),
  })
  .strict();
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

type RunRow = { id: string; assignmentId: string; algorithmVersion: string; inputDigest: string; submissionCount: number; skipped: unknown; createdAt: Date };

/**
 * Owner-only similarity runs for written assignments (TAI3-T4). Everything here is evidence for the teacher:
 * nothing is written to submissions, grades, statuses or notifications, and no student or parent read model
 * reads these tables.
 */
@Injectable()
export class SimilarityRunsService {
  constructor(@Inject(Db) private db: Db) {}

  /** 404 for a missing or foreign assignment, 409 for a lesson, lab or test assignment. */
  private async writtenAssignment(db: any, classId: string, assignmentId: string) {
    const assignment = await db.assignment.findFirst({ where: { id: assignmentId, classId }, select: { id: true, classId: true, contentType: true, contentId: true } });
    if (!assignment) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài đã giao" });
    if (assignment.contentType !== WRITTEN_CONTENT_TYPE)
      throw new ConflictException({ code: "NOT_A_WRITTEN_ASSIGNMENT", message: "Chỉ bài tự luận mới kiểm tra được nội dung tương đồng" });
    return assignment;
  }

  /** The latest submission of each student, whatever its timing or grading state (TAI3-T4 decision). */
  private async currentSubmissions(db: any, assignmentId: string, withAnswers: boolean) {
    const rows: Array<{ id: string; studentId: string; submittedAt: Date; resourceVersion: number; answers?: unknown }> = await db.assignmentSubmission.findMany({
      where: { assignmentId },
      select: { id: true, studentId: true, submittedAt: true, resourceVersion: true, ...(withAnswers ? { answers: true } : {}) },
    });
    const byStudent = new Map<string, typeof rows>();
    for (const row of rows) byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row]);
    return [...byStudent.values()].map((group) => latestSubmission(group)!);
  }

  /** sha256 of the sorted "submissionId:resourceVersion" lines; a resubmission changes it. */
  static inputDigest(current: Array<{ id: string; resourceVersion: number }>) {
    return createHash("sha256")
      .update(current.map((s) => `${s.id}:${s.resourceVersion}`).sort().join("\n"))
      .digest("hex");
  }

  private summary(run: RunRow, currentDigest: string, matchCount: number) {
    return {
      id: run.id,
      assignmentId: run.assignmentId,
      algorithmVersion: run.algorithmVersion,
      submissionCount: run.submissionCount,
      matchCount,
      skipped: run.skipped,
      createdAt: run.createdAt,
      stale: run.algorithmVersion !== SUBSIM_ALGORITHM_VERSION || run.inputDigest !== currentDigest,
    };
  }

  /** 201 for a new run, 200 (`replayed: true`) when a run for the same input digest already exists. */
  async create(classId: string, assignmentId: string, req: any, body: unknown) {
    z.object({}).strict().parse(body ?? {});
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status === "ARCHIVED") throw classArchived();
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes/:id/assignments/:aid/similarity-runs:" + assignmentId,
      payload: {},
    };
    try {
      return await idempotent(this.db, ctx, (tx) => this.createInTransaction(tx, classId, assignmentId, req));
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
      // Last guard: another request committed the same digest first, so return that run.
      const digest = SimilarityRunsService.inputDigest(await this.currentSubmissions(this.db, assignmentId, false));
      const existing = await this.db.submissionSimilarityRun.findUnique({
        where: { assignmentId_algorithmVersion_inputDigest: { assignmentId, algorithmVersion: SUBSIM_ALGORITHM_VERSION, inputDigest: digest } },
      });
      if (!existing) throw error;
      const matchCount = await this.db.submissionSimilarityMatch.count({ where: { runId: existing.id } });
      return { replayed: true, run: this.summary(existing as RunRow, digest, matchCount) };
    }
  }

  private async createInTransaction(tx: any, classId: string, assignmentId: string, req: any) {
    await lock(tx, "similarity:" + assignmentId);
    const assignment = await this.writtenAssignment(tx, classId, assignmentId);
    const resource = await tx.classResource.findFirst({ where: { id: assignment.contentId, classId, kind: "WRITTEN_TASK" }, select: { content: true } });
    if (!resource) throw new NotFoundException("Nội dung không còn khả dụng");
    const current = await this.currentSubmissions(tx, assignmentId, true);
    if (current.length < MIN_RUN_SUBMISSIONS)
      throw new ConflictException({ code: "SIMILARITY_INPUT_TOO_SMALL", message: "Cần ít nhất 2 bài nộp hiện tại để kiểm tra nội dung tương đồng" });
    if (current.length > MAX_RUN_SUBMISSIONS)
      throw new PayloadTooLargeException({ code: "SIMILARITY_INPUT_TOO_LARGE", message: `Tối đa ${MAX_RUN_SUBMISSIONS} bài nộp cho một lần kiểm tra` });

    const inputDigest = SimilarityRunsService.inputDigest(current);
    const existing = await tx.submissionSimilarityRun.findUnique({
      where: { assignmentId_algorithmVersion_inputDigest: { assignmentId, algorithmVersion: SUBSIM_ALGORITHM_VERSION, inputDigest } },
    });
    if (existing) {
      const matchCount = await tx.submissionSimilarityMatch.count({ where: { runId: existing.id } });
      await audit(tx, {
        actor: req.user,
        action: "similarity_run.create",
        targetType: "SubmissionSimilarityRun",
        targetId: existing.id,
        after: { assignmentId, algorithmVersion: SUBSIM_ALGORITHM_VERSION, submissionCount: existing.submissionCount, matchCount, replayed: true },
      });
      return { replayed: true, run: this.summary(existing as RunRow, inputDigest, matchCount) };
    }

    const prompts = ((resource.content as any)?.prompts ?? []).map((p: any) => ({ id: String(p.id), text: String(p.prompt ?? ""), commonPhrases: Array.isArray(p.commonPhrases) ? p.commonPhrases.map(String) : [] }));
    const result = computeSubmissionSimilarity({
      prompts,
      submissions: current.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        responses: (Array.isArray(s.answers) ? (s.answers as any[]) : []).map((a) => ({ promptId: String(a?.promptId ?? ""), text: String(a?.text ?? "") })),
      })),
    });
    const run = await tx.submissionSimilarityRun.create({
      data: { assignmentId, actorId: req.user.sub, algorithmVersion: result.algorithmVersion, inputDigest, submissionCount: current.length, skipped: result.skipped },
    });
    if (result.matches.length)
      await tx.submissionSimilarityMatch.createMany({
        data: result.matches.map((m) => ({ runId: run.id, submissionAId: m.submissionAId, submissionBId: m.submissionBId, level: m.level, maxContainment: m.maxContainment, perPrompt: m.perPrompt })),
      });
    await audit(tx, {
      actor: req.user,
      action: "similarity_run.create",
      targetType: "SubmissionSimilarityRun",
      targetId: run.id,
      after: { assignmentId, algorithmVersion: result.algorithmVersion, submissionCount: current.length, matchCount: result.matches.length, replayed: false },
    });
    return { replayed: false, run: this.summary(run as RunRow, inputDigest, result.matches.length) };
  }

  /** Runs newest first with a computed `stale` flag. */
  async list(classId: string, assignmentId: string, req: any, query: unknown) {
    const q = listQuery.parse(query ?? {});
    await ownedClass(this.db, classId, req.user);
    await this.writtenAssignment(this.db, classId, assignmentId);
    const digest = SimilarityRunsService.inputDigest(await this.currentSubmissions(this.db, assignmentId, false));
    const runs: Array<RunRow & { _count: { matches: number } }> = await this.db.submissionSimilarityRun.findMany({
      where: { assignmentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit,
      include: { _count: { select: { matches: true } } },
    });
    return { items: runs.map((run) => this.summary(run, digest, run._count.matches)) };
  }

  /** One run with its matches, current reviews, student names and the texts the spans point into. */
  async detail(classId: string, assignmentId: string, runId: string, req: any) {
    await ownedClass(this.db, classId, req.user);
    const assignment = await this.writtenAssignment(this.db, classId, assignmentId);
    const run = await this.db.submissionSimilarityRun.findFirst({ where: { id: runId, assignmentId } });
    if (!run) throw new NotFoundException({ code: "NOT_FOUND", message: "Không tìm thấy lần kiểm tra" });
    const digest = SimilarityRunsService.inputDigest(await this.currentSubmissions(this.db, assignmentId, false));
    const matches: Array<{ id: string; submissionAId: string; submissionBId: string; level: string; maxContainment: number; perPrompt: unknown }> = await this.db.submissionSimilarityMatch.findMany({
      where: { runId },
      orderBy: [{ maxContainment: "desc" }, { submissionAId: "asc" }, { submissionBId: "asc" }],
    });
    const submissionIds = [...new Set(matches.flatMap((m) => [m.submissionAId, m.submissionBId]))];
    const [reviews, submissions, resource] = await Promise.all([
      matches.length
        ? this.db.similarityMatchReview.findMany({ where: { matchId: { in: matches.map((m) => m.id) } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
        : [],
      submissionIds.length ? this.db.assignmentSubmission.findMany({ where: { id: { in: submissionIds } }, select: { id: true, studentId: true, answers: true } }) : [],
      this.db.classResource.findFirst({ where: { id: assignment.contentId, classId, kind: "WRITTEN_TASK" }, select: { content: true } }),
    ]);
    const students = submissions.length
      ? await this.db.user.findMany({ where: { id: { in: [...new Set(submissions.map((s: any) => s.studentId))] as string[] } }, select: { id: true, fullName: true, username: true } })
      : [];
    const submissionById = new Map<string, any>(submissions.map((s: any) => [s.id, s]));
    const studentById = new Map<string, any>(students.map((u: any) => [u.id, u]));
    const promptText = new Map<string, string>(((resource?.content as any)?.prompts ?? []).map((p: any) => [String(p.id), String(p.prompt ?? "")]));
    const textOf = (submissionId: string, promptId: string) => {
      const answers = submissionById.get(submissionId)?.answers;
      return String((Array.isArray(answers) ? answers : []).find((a: any) => a?.promptId === promptId)?.text ?? "");
    };
    const side = (submissionId: string) => ({ id: submissionId, student: studentById.get(submissionById.get(submissionId)?.studentId) ?? null });
    return {
      run: this.summary(run as RunRow, digest, matches.length),
      matches: matches.map((m) => {
        const own = (reviews as any[]).filter((r) => r.matchId === m.id);
        const latest = own[0];
        return {
          id: m.id,
          level: m.level,
          maxContainment: m.maxContainment,
          submissionA: side(m.submissionAId),
          submissionB: side(m.submissionBId),
          review: latest ? { status: latest.status, note: latest.note, createdAt: latest.createdAt } : null,
          reviewCount: own.length,
          perPrompt: (Array.isArray(m.perPrompt) ? m.perPrompt : []).map((p: any) => ({
            ...p,
            promptText: promptText.get(p.promptId) ?? "",
            textA: textOf(m.submissionAId, p.promptId),
            textB: textOf(m.submissionBId, p.promptId),
          })),
        };
      }),
    };
  }

  /** Appends a review; the newest one is current. Allowed on a stale run; never stores the note in the audit. */
  async review(classId: string, assignmentId: string, runId: string, matchId: string, req: any, body: unknown) {
    const b = reviewSchema.parse(body);
    const classroom = await ownedClass(this.db, classId, req.user);
    if (classroom.status === "ARCHIVED") throw classArchived();
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST similarity-runs/:runId/matches/:matchId/reviews:" + matchId,
      payload: b,
    };
    return idempotent(this.db, ctx, async (tx) => {
      await this.writtenAssignment(tx, classId, assignmentId);
      const run = await tx.submissionSimilarityRun.findFirst({ where: { id: runId, assignmentId }, select: { id: true } });
      const match = run ? await tx.submissionSimilarityMatch.findFirst({ where: { id: matchId, runId }, select: { id: true } }) : null;
      if (!run || !match) throw new NotFoundException({ code: "NOT_FOUND", message: "Không tìm thấy cặp bài nộp" });
      const row = await tx.similarityMatchReview.create({ data: { matchId, actorId: req.user.sub, status: b.status, note: b.note ? b.note : null } });
      await audit(tx, {
        actor: req.user,
        action: "similarity_match.review",
        targetType: "SubmissionSimilarityMatch",
        targetId: matchId,
        after: { runId, matchId, status: b.status },
      });
      return { matchId, review: { id: row.id, status: row.status, note: row.note, createdAt: row.createdAt } };
    });
  }
}
