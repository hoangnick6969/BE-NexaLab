import { z } from "zod";

export type WatchedRange = { startSecond: number; endSecond: number };

export const startVideoSessionSchema = z.object({
  clientSessionId: z.string().uuid(),
  provider: z.enum(["YOUTUBE", "DIRECT"]),
  providerVideoId: z.string().trim().min(1).max(200),
  durationSeconds: z.number().int().positive().max(86400),
}).strict();

export const videoObservationSchema = z.object({
  sequence: z.number().int().positive(),
  fromSecond: z.number().int().min(0).max(86400),
  toSecond: z.number().int().min(0).max(86400),
  observedMediaSeconds: z.number().min(0).max(30),
  playbackRate: z.number().min(0.25).max(2),
  playerState: z.enum(["PLAYING", "PAUSED", "BUFFERING", "ENDED", "HIDDEN"]),
  clientObservedAt: z.string().datetime(),
}).strict();

export function mergeWatchedRanges(ranges: WatchedRange[], durationSeconds: number): WatchedRange[] {
  const normalized = ranges
    .map((range) => ({
      startSecond: Math.max(0, Math.min(durationSeconds, Math.floor(range.startSecond))),
      endSecond: Math.max(0, Math.min(durationSeconds, Math.ceil(range.endSecond))),
    }))
    .filter((range) => range.endSecond > range.startSecond)
    .sort((a, b) => a.startSecond - b.startSecond || a.endSecond - b.endSecond);
  const merged: WatchedRange[] = [];
  for (const range of normalized) {
    const prior = merged.at(-1);
    if (prior && range.startSecond <= prior.endSecond + 1) prior.endSecond = Math.max(prior.endSecond, range.endSecond);
    else merged.push({ ...range });
  }
  return merged;
}

export const watchedSeconds = (ranges: WatchedRange[]) => ranges.reduce((total, range) => total + range.endSecond - range.startSecond, 0);

export function acceptedObservationRange(input: z.infer<typeof videoObservationSchema>, durationSeconds: number, elapsedServerSeconds: number): WatchedRange | null {
  if (input.playerState !== "PLAYING" || input.toSecond <= input.fromSecond) return null;
  if (input.fromSecond > durationSeconds || input.toSecond > durationSeconds) return null;
  const mediaAdvance = input.toSecond - input.fromSecond;
  const credibleAdvance = Math.min(30, Math.max(0, elapsedServerSeconds) * input.playbackRate + 3);
  if (mediaAdvance > credibleAdvance || mediaAdvance > input.observedMediaSeconds + 3) return null;
  return { startSecond: Math.floor(input.fromSecond), endSecond: Math.ceil(input.toSecond) };
}

function scopeKey(assignmentId?: string | null) {
  return assignmentId ? `assignment:${assignmentId}` : "self";
}

export async function startVideoSession(db: any, args: {
  studentId: string;
  step: { id: string; type: string; config: any };
  assignmentId?: string | null;
  input: z.infer<typeof startVideoSessionSchema>;
}) {
  if (args.step.type !== "VIDEO") throw new Error("VIDEO_STEP_REQUIRED");
  const config = args.step.config as any;
  if (config.provider && config.provider !== args.input.provider) throw new Error("VIDEO_PROVIDER_MISMATCH");
  if (config.providerVideoId && config.providerVideoId !== args.input.providerVideoId) throw new Error("VIDEO_ID_MISMATCH");
  const key = scopeKey(args.assignmentId);
  let evidence = await db.videoProgressEvidence.findUnique({
    where: { studentId_stepId_scopeKey: { studentId: args.studentId, stepId: args.step.id, scopeKey: key } },
  });
  if (evidence && Math.abs(evidence.durationSeconds - args.input.durationSeconds) > Math.max(3, evidence.durationSeconds * 0.05))
    throw new Error("VIDEO_DURATION_MISMATCH");
  if (!evidence) evidence = await db.videoProgressEvidence.create({
    data: {
      studentId: args.studentId,
      stepId: args.step.id,
      assignmentId: args.assignmentId ?? null,
      scopeKey: key,
      durationSeconds: args.input.durationSeconds,
      lastPosition: 0,
    },
  });
  const session = await db.videoPlaybackSession.upsert({
    where: { studentId_stepId_clientSessionId: { studentId: args.studentId, stepId: args.step.id, clientSessionId: args.input.clientSessionId } },
    create: {
      evidenceId: evidence.id,
      studentId: args.studentId,
      stepId: args.step.id,
      assignmentId: args.assignmentId ?? null,
      provider: args.input.provider,
      clientSessionId: args.input.clientSessionId,
      lastPosition: evidence.lastPosition,
    },
    update: {},
  });
  return {
    sessionId: session.id,
    resumeAt: evidence.lastPosition,
    coveragePercent: evidence.coveragePercent,
    watchedRanges: evidence.watchedRanges,
    status: evidence.completedAt ? "COMPLETED" : evidence.watchedSeconds > 0 ? "IN_PROGRESS" : "NOT_STARTED",
    heartbeatIntervalSeconds: 10,
  };
}

export async function observeVideoSession(db: any, args: {
  studentId: string;
  sessionId: string;
  input: z.infer<typeof videoObservationSchema>;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const session = await db.videoPlaybackSession.findFirst({
    where: { id: args.sessionId, studentId: args.studentId },
    include: { evidence: true, step: true },
  });
  if (!session) throw new Error("VIDEO_SESSION_NOT_FOUND");
  if (args.input.sequence <= session.lastSequence) {
    if (args.input.sequence === session.lastSequence && session.lastResult) return session.lastResult;
    throw new Error("VIDEO_SEQUENCE_OUT_OF_ORDER");
  }
  const duration = session.evidence.durationSeconds;
  const previousObservedAt = session.lastClientObservedAt ?? session.startedAt;
  const elapsedServerSeconds = Math.max(0, (now.getTime() - new Date(previousObservedAt).getTime()) / 1000);
  const accepted = acceptedObservationRange(args.input, duration, elapsedServerSeconds);
  const previousRanges = Array.isArray(session.evidence.watchedRanges) ? session.evidence.watchedRanges as WatchedRange[] : [];
  const priorSeconds = watchedSeconds(mergeWatchedRanges(previousRanges, duration));
  const merged = mergeWatchedRanges(accepted ? [...previousRanges, accepted] : previousRanges, duration);
  const total = watchedSeconds(merged);
  const rawAccepted = accepted ? accepted.endSecond - accepted.startSecond : 0;
  const replayIncrement = Math.max(0, rawAccepted - (total - priorSeconds));
  const coveragePercent = duration ? Math.min(100, Math.floor(total / duration * 100)) : 0;
  const config = session.step.config as any;
  const threshold = duration <= 30 ? 100 : Number(config?.completionThresholdPercent ?? 90);
  const wasCompleted = Boolean(session.evidence.completedAt);
  const completed = wasCompleted || coveragePercent >= threshold;
  const result = {
    acceptedRange: accepted,
    coveragePercent,
    watchedSeconds: total,
    replaySeconds: session.evidence.replaySeconds + replayIncrement,
    lastPosition: Math.min(duration, Math.max(0, args.input.toSecond)),
    status: completed ? "COMPLETED" : "IN_PROGRESS",
    completedAt: session.evidence.completedAt ?? (completed ? now : null),
  };
  await db.videoProgressEvidence.update({
    where: { id: session.evidence.id },
    data: {
      watchedRanges: merged,
      watchedSeconds: total,
      replaySeconds: result.replaySeconds,
      coveragePercent,
      lastPosition: result.lastPosition,
      completionMethod: completed ? "VIDEO_COVERAGE" : session.evidence.completionMethod,
      completedAt: result.completedAt,
      lastObservedAt: now,
    },
  });
  await db.videoPlaybackSession.update({
    where: { id: session.id },
    data: {
      lastSequence: args.input.sequence,
      lastPosition: result.lastPosition,
      lastClientObservedAt: now,
      lastResult: result,
      ...(args.input.playerState === "ENDED" ? { endedAt: now } : {}),
    },
  });
  const progressData = {
    status: completed ? "COMPLETED" : "IN_PROGRESS",
    progressValue: coveragePercent,
    lastPosition: result.lastPosition,
    startedAt: session.evidence.startedAt,
    completedAt: result.completedAt,
  };
  const existing = await db.stepProgress.findFirst({ where: { studentId: args.studentId, stepId: session.stepId, assignmentId: session.assignmentId } });
  if (existing) await db.stepProgress.update({ where: { id: existing.id }, data: progressData });
  else await db.stepProgress.create({ data: { studentId: args.studentId, stepId: session.stepId, assignmentId: session.assignmentId, ...progressData } });
  return result;
}
