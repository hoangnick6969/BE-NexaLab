import { z } from "zod";

const url = z.string().refine((value) =>
  /^https?:\/\//.test(value) || /^asset:[0-9a-f-]{36}$/.test(value),
);
const reading = z.object({ html: z.string().trim().min(1) });
const video = z.object({
  url: z.preprocess((value) => value === null ? undefined : value, url.optional()),
  title: z.string().trim().min(1),
  transcript: z.string().trim().min(1).optional(),
  equivalentText: z.string().trim().min(1).optional(),
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
const quiz = z.object({ questions: z.array(z.unknown()).min(1) });
const lab = z.object({ labId: z.string().trim().min(1) });
const challenge = z.object({ challengeId: z.string().trim().min(1) });

export const stepConfigSchemas = {
  READING: reading,
  VIDEO: video,
  STUDY_CARDS: cards,
  QUIZ: quiz,
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
  }>;
};

const videoTiming = {
  positionSeconds: z.number().int().min(0).max(86400),
  durationSeconds: z.number().int().min(0).max(86400),
};

export const stepProgressActionSchema = z.union([
  z.object({ action: z.literal("complete") }).strict(),
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

export function reconcileVideoProgress(
  config: unknown,
  saved: {
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progressValue: number;
    lastPosition: number | null;
    startedAt: Date | null;
    completedAt: Date | null;
  } | undefined,
  action: Exclude<StepProgressAction, { action: "complete" }>,
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
    action.action === "ended" ||
    (action.durationSeconds > 0 && action.positionSeconds / action.durationSeconds >= 0.9);

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
  materials: Array<{ type: "video" | "pdf" | "image"; url: string; title: string }>;
  questions: unknown[];
  labId?: string | null;
}) {
  const result: Array<{ type: StepType; position: number; required: boolean; config: unknown }> = [];
  result.push({ type: "READING", position: 10, required: true, config: { html: lesson.content } });
  const videoMaterial = lesson.materials.find((item) => item.type === "video");
  result.push({
    type: "VIDEO",
    position: 20,
    required: true,
    config: videoMaterial
      ? videoMaterial
      : { title: "Nội dung thay thế", equivalentText: lesson.content },
  });
  if (lesson.questions.length)
    result.push({ type: "QUIZ", position: 40, required: true, config: { questions: lesson.questions } });
  if (lesson.labId)
    result.push({ type: "LAB", position: 50, required: true, config: { labId: lesson.labId } });
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
  return step.type === "READING" || step.type === "VIDEO" || step.type === "STUDY_CARDS"
    ? config
    : null;
}

export function buildPathwaySteps(steps: StoredStep[]) {
  let blocked = false;
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
    const future = ["QUIZ", "LAB", "CHALLENGE"].includes(step.type);
    const state = completed ? "COMPLETED" : !blocked && !future ? "IN_PROGRESS" : "LOCKED";
    if (state === "IN_PROGRESS" && nextStepId === null) nextStepId = step.id;
    if (step.required && !completed) blocked = true;
    const lockReasonCode =
      state !== "LOCKED"
        ? null
        : step.type === "LAB"
          ? "QUIZ_NOT_PASSED"
          : step.type === "CHALLENGE"
            ? "PRACTICE_NOT_PASSED"
            : "PREREQUISITE_INCOMPLETE";
    return {
      id: step.id,
      type: step.type,
      position: step.position,
      required: step.required,
      state,
      progressValue: saved?.progressValue ?? 0,
      lastPosition: saved?.lastPosition ?? null,
      lockReasonCode,
      resource: state === "LOCKED" ? null : resource(step),
    };
  });
  return { steps: ordered, nextStepId };
}

