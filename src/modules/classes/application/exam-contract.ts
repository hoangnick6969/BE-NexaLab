import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assignmentExecutionSchema, digest } from "../../labs/application/lab-run";
import { snapshotAssignmentLab } from "../../labs/application/assignment-lab-execution";
import { testQuestionSchema } from "./question-resource-contract";
import { studentWrittenTaskContent, writtenPromptSchema } from "./written-resource-contract";
import { toScale10 } from "./assessment-policy";

export const EXAM_CONTENT_TYPE = "exam";
export const writtenContentType = (type: string) => type === "written" || type === EXAM_CONTENT_TYPE;
export const assessmentResourceKind = (type: string) => type === EXAM_CONTENT_TYPE ? "EXAM" : type === "written" ? "WRITTEN_TASK" : "TEST";

const itemMeta = {
  points: z.number().finite(),
  cognitiveLevel: z.enum(["RECALL", "UNDERSTAND", "APPLY"]),
};
const identifier = z.string().trim().min(1).max(100);
const labItem = z.object({
  ...itemMeta,
  labId: identifier,
  releaseId: identifier,
  challengeId: identifier,
  prompt: z.string().trim().min(1).max(2000),
}).strict();

const examSchema = z.object({
  questions: z.array(testQuestionSchema.extend(itemMeta)).max(100).default([]),
  labs: z.array(labItem).max(10).default([]),
}).strict();

export function pointsUnits(points: number) {
  return Math.round(points * 100);
}

export function normalizeExam(raw: unknown) {
  // The strict written schema validates the rubric fields after removing the exam metadata.
  const writtenItem = z.object(itemMeta).passthrough().transform((item, ctx) => {
    const { points, cognitiveLevel, ...rubric } = item;
    const parsed = writtenPromptSchema.safeParse(rubric);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue(issue);
      return z.NEVER;
    }
    return { ...parsed.data, points, cognitiveLevel };
  });
  const parsed = examSchema.extend({ prompts: z.array(writtenItem).max(5).default([]) }).safeParse(raw);
  if (!parsed.success) throw new BadRequestException({ code: "EXAM_CONTENT_INVALID", details: parsed.error.issues });
  const { questions, prompts, labs } = parsed.data;
  const sections = [questions, prompts, labs];
  const items = sections.flat();
  if (
    sections.filter((section) => section.length).length < 2 ||
    items.some(({ points }) => points <= 0 || points > 10 || points !== pointsUnits(points) / 100) ||
    items.reduce((sum, item) => sum + pointsUnits(item.points), 0) !== 1000 ||
    prompts.some((item) => item.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0) !== item.points)
  ) throw new BadRequestException({ code: "EXAM_POINTS_INVALID", message: "Đề cần ít nhất hai phần, tổng đúng 10 điểm và điểm tự luận phải bằng tổng điểm tiêu chí." });
  if (questions.some((q) => q.correctOption >= q.options.length))
    throw new BadRequestException({ code: "TEST_ANSWER_INVALID" });
  return {
    questions: questions.map((q) => ({ ...q, id: randomUUID(), options: q.options.map((text) => ({ id: randomUUID(), text })) })),
    prompts: prompts.map((p) => ({ ...p, id: randomUUID() })),
    labs: labs.map((lab) => ({ ...lab, id: randomUUID() })),
  };
}

type ExamPaper = ReturnType<typeof normalizeExam>;
type PinnedLab = ExamPaper["labs"][number] & {
  execution: z.infer<typeof assignmentExecutionSchema>;
  executionDigest: string;
};
export type PublishedExam = Omit<ExamPaper, "labs"> & { labs: PinnedLab[] };

export async function pinExamLabs(tx: Prisma.TransactionClient, content: ExamPaper): Promise<Prisma.InputJsonObject> {
  if (!content.labs.length) return content;
  const eligible = new Set((await tx.lab.findMany({
    where: { id: { in: [...new Set(content.labs.map((lab) => lab.labId))] }, status: "published",
      scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: { not: null } },
    select: { id: true },
  })).map((lab) => lab.id));
  const labs: PinnedLab[] = [];
  // The regular Lab publisher takes locks per lab. Use a stable order when the exam pins several.
  for (const lab of [...content.labs].sort((a, b) => a.labId.localeCompare(b.labId))) {
    if (!eligible.has(lab.labId)) throw new BadRequestException({ code: "EXAM_LAB_UNAVAILABLE" });
    const execution = await snapshotAssignmentLab(tx, lab.labId, lab.releaseId, lab.challengeId);
    labs.push({ ...lab, execution, executionDigest: digest(execution) });
  }
  const byId = new Map(labs.map((lab) => [lab.id, lab]));
  return { ...content, labs: content.labs.map((lab) => byId.get(lab.id)!) };
}

export function studentExamContent(content: PublishedExam) {
  const written = studentWrittenTaskContent(content);
  return {
    questions: content.questions.map(({ id, prompt, points, cognitiveLevel, options }) => ({
      id, prompt, points, cognitiveLevel, options: options.map(({ id, text }) => ({ id, text })),
    })),
    prompts: written.prompts.map((prompt, index) => ({
      ...prompt, points: content.prompts[index].points, cognitiveLevel: content.prompts[index].cognitiveLevel,
    })),
    labs: content.labs.map(({ id, prompt, points, cognitiveLevel, labId, challengeId }) => ({
      id, prompt, points, cognitiveLevel, labId, challengeId,
    })),
  };
}

export type ExamComponents = {
  mcqUnits: number;
  labUnits: number;
  writtenRequired: boolean;
  choices: Array<{ questionId: string; optionId: string }>;
  attempts: Array<{ id: string; itemId: string; passed: boolean }>;
};

export function examTotalRaw(components: ExamComponents, writtenPoints?: number | null) {
  if (components.writtenRequired && writtenPoints == null) return null;
  return (components.mcqUnits + components.labUnits + pointsUnits(writtenPoints ?? 0)) / 100;
}

export function examTotal10(components: ExamComponents, writtenPoints?: number | null) {
  const raw = examTotalRaw(components, writtenPoints);
  return raw === null ? null : toScale10(raw, 10);
}
