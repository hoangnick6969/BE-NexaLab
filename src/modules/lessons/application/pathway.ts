import { z } from "zod";
import { createHash } from "node:crypto";

const url = z.string().refine((value) =>
  /^https?:\/\//.test(value) || /^asset:[0-9a-f-]{36}$/.test(value) || /^assetv:[a-z0-9]{20,40}$/.test(value),
);
const reading = z.object({ html: z.string().trim().min(1) });
const video = z.object({
  videoId: z.string().trim().min(1).max(80).optional(),
  url: z.preprocess((value) => value === null ? undefined : value, url.optional()),
  title: z.string().trim().min(1),
  provider: z.enum(["YOUTUBE", "DIRECT"]).optional(),
  providerVideoId: z.string().trim().min(1).max(200).optional(),
  transcript: z.string().trim().min(1).optional(),
  equivalentText: z.string().trim().min(1).optional(),
  captionUrl: z.string().url().nullable().optional(),
  completionThresholdPercent: z.number().int().min(50).max(100).optional(),
  provenance: z.record(z.unknown()).optional(),
}).refine((value) => value.url || value.equivalentText, {
  message: "Video requires a URL or approved equivalent text",
});
const cards = z.object({
  cards: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        front: z.string().trim().min(1),
        back: z.string().trim().min(1),
      }),
    )
    .min(1)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
});
const quizQuestion = z.object({
  id: z.string().min(1).max(80),
  prompt: z.string().trim().min(1),
  options: z.array(z.object({ id: z.string().min(1).max(80), text: z.string().trim().min(1) }).strict()).min(2).max(6),
  answerOptionId: z.string().min(1).max(80),
}).strict().refine((question) =>
  new Set([question.id, ...question.options.map((option) => option.id)]).size === question.options.length + 1 &&
  question.options.some((option) => option.id === question.answerOptionId),
);
export const quizConfigSchema = z.object({
  questions: z.array(quizQuestion).min(1).max(30)
    .refine((questions) => new Set(questions.map((question) => question.id)).size === questions.length),
  passThreshold: z.literal(50).default(50),
}).strict();
export const quizAttemptRequestSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1).max(80), optionId: z.string().min(1).max(80) }).strict()).min(1).max(30),
  idempotencyKey: z.string().uuid(),
}).strict().refine((request) =>
  new Set(request.answers.map((answer) => answer.questionId)).size === request.answers.length,
  { message: "Duplicate question answers" },
);
const basicExerciseQuestion = z.object({
  id: z.string().min(1).max(80),
  prompt: z.string().trim().min(1),
  options: z.array(z.object({ id: z.string().min(1).max(80), text: z.string().trim().min(1) }).strict()).min(2).max(6),
  correctOptionId: z.string().min(1).max(80),
}).strict().refine((question) =>
  new Set([question.id, ...question.options.map((option) => option.id)]).size === question.options.length + 1 &&
  question.options.some((option) => option.id === question.correctOptionId),
);
export const basicExerciseConfigSchema = z.object({
  questions: z.array(basicExerciseQuestion).min(1).max(30)
    .refine((questions) => new Set(questions.map((question) => question.id)).size === questions.length),
  passThreshold: z.number().int().min(1).max(100),
}).strict();
export const basicExerciseAttemptRequestSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1).max(80), optionId: z.string().min(1).max(80) }).strict()).min(1).max(30),
  idempotencyKey: z.string().uuid(),
}).strict().refine((request) => new Set(request.answers.map((answer) => answer.questionId)).size === request.answers.length);
export function evaluateBasicExercise(config: unknown, request: z.infer<typeof basicExerciseAttemptRequestSchema>) {
  const parsed = basicExerciseConfigSchema.parse(config);
  if (request.answers.length !== parsed.questions.length || request.answers.some((answer) => !parsed.questions.some((question) => question.id === answer.questionId && question.options.some((option) => option.id === answer.optionId))))
    throw new Error("EXERCISE_ANSWERS_INVALID");
  const correct = request.answers.filter((answer) => parsed.questions.some((question) => question.id === answer.questionId && question.correctOptionId === answer.optionId)).length;
  const score = Math.floor(correct * 100 / parsed.questions.length);
  return { score, passThreshold: parsed.passThreshold, passed: score >= parsed.passThreshold };
}
export function sanitizeBasicExerciseConfig(config: unknown) {
  const parsed = basicExerciseConfigSchema.parse(config);
  return { passThreshold: parsed.passThreshold, questions: parsed.questions.map(({ id, prompt, options }) => ({ id, prompt, options })) };
}
export type QuizQuestion = z.infer<typeof quizQuestion>;
export type QuizAttemptRequest = z.infer<typeof quizAttemptRequestSchema>;

function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("md5").update(value).digest("hex")}`;
}

/**
 * `namespace` gives a cloned lesson its own question/option IDs (D7); lessons
 * without one keep their historical prompt-derived IDs.
 */
export function materializeQuizQuestions(questions: unknown[], namespace?: string): QuizQuestion[] {
  const occurrences = new Map<string, number>();
  const promptCounts = new Map<string, number>();
  for (const question of questions as any[]) {
    if (typeof question?.prompt === "string") promptCounts.set(question.prompt.trim(), (promptCounts.get(question.prompt.trim()) ?? 0) + 1);
  }
  return quizConfigSchema.parse({
    questions: questions.map((raw, questionIndex) => {
      const parsed = z.object({ prompt: z.string().trim().min(1), options: z.array(z.string().trim().min(1)).min(2).max(6), answer: z.number().int().min(0).max(5) })
        .refine((question) => question.answer < question.options.length).parse(raw);
      const id = stableId("question", namespace ? `${namespace}:${parsed.prompt}` : parsed.prompt);
      const promptOccurrence = questions.slice(0, questionIndex).filter((prior: any) => prior?.prompt?.trim() === parsed.prompt).length;
      const options = parsed.options.map((text) => {
        const key = `${id}:${text}`;
        const occurrence = occurrences.get(key) ?? 0;
        occurrences.set(key, occurrence + 1);
        return { id: stableId("option", key) + (occurrence ? `-${occurrence}` : ""), text };
      });
      return {
        id: id + (promptCounts.get(parsed.prompt)! > 1 ? `-${promptOccurrence}` : ""),
        prompt: parsed.prompt,
        options,
        answerOptionId: options[parsed.answer].id,
      };
    }),
  }).questions;
}

export function sanitizeQuizConfig(config: unknown) {
  const parsed = quizConfigSchema.parse(config);
  return { questions: parsed.questions.map(({ id, prompt, options }) => ({ id, prompt, options })) };
}
const lab = z.object({ labId: z.string().trim().min(1) });
const challenge = z.object({ challengeId: z.string().trim().min(1), sameAsLab: z.boolean().optional() });

export const stepConfigSchemas = {
  READING: reading,
  VIDEO: video,
  STUDY_CARDS: cards,
  QUIZ: quizConfigSchema,
  BASIC_EXERCISE: basicExerciseConfigSchema,
  LAB: lab,
  CHALLENGE: challenge,
} as const;

export type StepType = keyof typeof stepConfigSchemas;
export type StoredStep = {
  id: string;
  type: StepType;
  position: number;
  required: boolean;
  config: unknown;
  progress?: Array<{
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progressValue: number;
    lastPosition?: number | null;
    visitedCardIds?: unknown;
  }>;
};

const videoTiming = {
  positionSeconds: z.number().int().min(0).max(86400),
  durationSeconds: z.number().int().min(0).max(86400),
};

export const stepProgressActionSchema = z.union([
  z.object({ action: z.literal("complete") }).strict(),
  z.object({ action: z.literal("visit"), cardIndex: z.number().int().min(0).max(10000) }).strict(),
  z.object({ action: z.literal("complete"), cardIndex: z.number().int().min(0).max(10000) }).strict(),
  z.object({ action: z.literal("heartbeat"), ...videoTiming })
    .strict()
    .refine((value) => value.positionSeconds <= value.durationSeconds, {
      message: "Playback position cannot exceed duration",
    }),
  z.object({ action: z.literal("ended"), ...videoTiming })
    .strict()
    .refine((value) => value.positionSeconds <= value.durationSeconds, {
      message: "Playback position cannot exceed duration",
    }),
  z.object({ action: z.literal("complete-fallback") }).strict(),
]);

export type StepProgressAction = z.infer<typeof stepProgressActionSchema>;

export function reconcileCardProgress(
  config: unknown,
  saved: { status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; visitedCardIds?: unknown } | undefined,
  action: Extract<StepProgressAction, { action: "visit" | "complete"; cardIndex: number }>,
  now: Date,
) {
  const parsed = cards.parse(config).cards;
  const prior = Array.isArray(saved?.visitedCardIds) ? saved.visitedCardIds.filter((id): id is string => typeof id === "string") : [];
  if (action.cardIndex >= parsed.length) throw new Error("CARD_INDEX_INVALID");
  const visited = [...new Set([...prior, parsed[action.cardIndex].id])];
  const completed = visited.length === parsed.length;
  if (action.action === "complete" && !completed) throw new Error("CARDS_INCOMPLETE");
  return {
    status: completed ? "COMPLETED" as const : "IN_PROGRESS" as const,
    progressValue: Math.floor((visited.length / parsed.length) * 100),
    visitedCardIds: visited,
    startedAt: saved && "startedAt" in saved ? (saved as any).startedAt ?? now : now,
    completedAt: completed ? now : null,
  };
}

export function reconcileVideoProgress(
  config: unknown,
  saved: {
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progressValue: number;
    lastPosition: number | null;
    startedAt: Date | null;
    completedAt: Date | null;
  } | undefined,
  action: Extract<StepProgressAction, { action: "heartbeat" | "ended" | "complete-fallback" }>,
  now: Date,
) {
  const parsedConfig = video.parse(config);
  if (action.action === "complete-fallback" && !parsedConfig.equivalentText)
    throw new Error("VIDEO_EQUIVALENT_UNAVAILABLE");

  const previousProgress = saved?.progressValue ?? 0;
  const previousPosition = saved?.lastPosition ?? 0;
  const observedProgress = action.action === "complete-fallback"
    ? 100
    : action.durationSeconds === 0
      ? 0
      : Math.floor((action.positionSeconds / action.durationSeconds) * 100);
  const completed =
    saved?.status === "COMPLETED" ||
    action.action === "complete-fallback" ||
    (action.durationSeconds > 0 && action.positionSeconds / action.durationSeconds >= (action.durationSeconds <= 30 ? 1 : (parsedConfig.completionThresholdPercent ?? 90) / 100));

  return {
    status: completed ? "COMPLETED" as const : "IN_PROGRESS" as const,
    progressValue: completed ? 100 : Math.max(previousProgress, observedProgress),
    lastPosition: action.action === "complete-fallback"
      ? saved?.lastPosition ?? null
      : Math.max(previousPosition, action.positionSeconds),
    startedAt: saved?.startedAt ?? now,
    completedAt: saved?.completedAt ?? (completed ? now : null),
  };
}

export function materializeLegacySteps(lesson: {
  content: string;
  materials: Array<{ type: "video" | "pdf" | "image"; url: string; title: string; transcript?: string }>;
  questions: unknown[];
  basicExercises?: { id: string; questions: unknown[]; passThreshold: number };
  labId?: string | null;
  videos?: Array<{ id: string; title: string; url: string; provider: "YOUTUBE" | "DIRECT"; providerVideoId: string; transcript?: string; equivalentText?: string; captionUrl?: string | null; completionThresholdPercent?: number; provenance?: Record<string, unknown> }>;
  sections?: Array<{ id: string; videos: Array<{ id: string; title: string; url: string; provider: "YOUTUBE" | "DIRECT"; providerVideoId: string; transcript?: string; equivalentText?: string; captionUrl?: string | null; completionThresholdPercent?: number; provenance?: Record<string, unknown> }> }>;
}, namespace?: string) {
  const result: Array<{ id?: string; type: StepType; position: number; required: boolean; config: unknown }> = [];
  result.push({ type: "READING", position: 10, required: true, config: { html: lesson.content } });
  const mappedVideos = [...(lesson.videos ?? []), ...(lesson.sections ?? []).flatMap((section) => section.videos)];
  const videoMaterial = lesson.materials.find((item) => item.type === "video");
  if (mappedVideos.length) mappedVideos.forEach((item, index) => result.push({
    id: `video-${item.id}`,
    type: "VIDEO",
    position: 20 + index * 10,
    required: true,
    config: { ...item, videoId: item.id },
  }));
  else result.push({
    type: "VIDEO",
    position: 20,
    required: true,
    config: videoMaterial ? videoMaterial : { title: "Nội dung thay thế", equivalentText: lesson.content },
  });
  const afterVideos = 20 + Math.max(1, mappedVideos.length) * 10;
  if (lesson.basicExercises)
    result.push({
      id: lesson.basicExercises.id,
      type: "BASIC_EXERCISE",
      position: afterVideos,
      required: true,
      config: {
        questions: lesson.basicExercises.questions,
        passThreshold: lesson.basicExercises.passThreshold,
      },
    });
  if (lesson.questions.length)
    result.push({ type: "QUIZ", position: afterVideos + 10, required: true, config: { questions: materializeQuizQuestions(lesson.questions, namespace) } });
  if (lesson.labId)
    result.push({ type: "LAB", position: afterVideos + 20, required: true, config: { labId: lesson.labId } });
  return validateLessonSteps(result);
}

export function validateLessonSteps<T extends { type: StepType; position: number; config: unknown }>(steps: T[]) {
  const positions = new Set<number>();
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .map((step) => {
      if (!Number.isInteger(step.position) || step.position < 1 || positions.has(step.position))
        throw new Error("Lesson steps require unique positive positions");
      positions.add(step.position);
      return { ...step, config: stepConfigSchemas[step.type].parse(step.config) };
    });
}

function resource(step: StoredStep) {
  const config = stepConfigSchemas[step.type].parse(step.config);
  if (step.type === "QUIZ") return sanitizeQuizConfig(config);
  if (step.type === "BASIC_EXERCISE") return sanitizeBasicExerciseConfig(config);
  return step.type === "READING" || step.type === "VIDEO" || step.type === "STUDY_CARDS" || step.type === "LAB" || step.type === "CHALLENGE" ? config : null;
}

export function buildPathwaySteps(steps: StoredStep[]) {
  // The first required step that is not complete; locked steps name it as their reason.
  let blocker: StepType | null = null;
  let nextStepId: string | null = null;
  const ordered = validateLessonSteps(steps).map((step) => {
    const saved = step.progress?.[0];
    if (
      saved &&
      (!Number.isInteger(saved.progressValue) || saved.progressValue < 0 || saved.progressValue > 100)
    )
      throw new Error("Step progress must be between 0 and 100");
    if (
      saved?.lastPosition != null &&
      (!Number.isInteger(saved.lastPosition) || saved.lastPosition < 0 || saved.lastPosition > 86400)
    )
      throw new Error("Step resume position must be a valid integer second");
    const completed = saved?.status === "COMPLETED";
    const future = false;
    const state = completed ? "COMPLETED" : blocker === null && !future ? "IN_PROGRESS" : "LOCKED";
    if (state === "IN_PROGRESS" && nextStepId === null) nextStepId = step.id;
    const lockReasonCode =
      state !== "LOCKED"
        ? null
        : blocker === "QUIZ"
          ? "QUIZ_NOT_PASSED"
          : blocker === "LAB" && step.type === "CHALLENGE"
            ? "PRACTICE_NOT_PASSED"
            : "PREREQUISITE_INCOMPLETE";
    if (step.required && !completed && step.type !== "BASIC_EXERCISE" && blocker === null) blocker = step.type;
    return {
      id: step.id,
      type: step.type,
      position: step.position,
      required: step.required,
      state,
      progressValue: saved?.progressValue ?? 0,
      lastPosition: saved?.lastPosition ?? null,
      ...(step.type === "STUDY_CARDS" ? { visitedCardIds: Array.isArray(saved?.visitedCardIds) ? saved.visitedCardIds : [] } : {}),
      lockReasonCode,
      resource: state === "LOCKED" ? null : resource(step),
    };
  });
  return { steps: ordered, nextStepId };
}

