import { createHash } from "node:crypto";
import {
  assertProviderPayloadSafe,
  MAX_REDACTED_SHARE,
  PrivacyGuardError,
  redact,
  redactedShare,
  REDACTION_VERSION,
  type AssessPromptPayload,
  type KnownIdentities,
  type OffsetMap,
} from "./assessment-privacy";
import type { AssessSnapshotV1 } from "./assessment-suggestion";

type RubricPrompt = {
  id: string;
  prompt: string;
  referenceAnswer?: string;
  criteria: Array<{ code: string; description: string; maxPoints: number; anchors: Array<{ points: number; description: string }> }>;
};

export type SnapshotOutcome =
  | { ok: true; snapshot: AssessSnapshotV1; digest: string }
  | { ok: false; detail: "REDACTION_DOMINANT" | "IDENTIFIER_IN_PAYLOAD" | "RESPONSE_MISSING"; reasons: string[] };

const stable = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(value);

/**
 * Builds the stored snapshot for one submission (pure; identities are passed in and never stored). Only the
 * AssessPromptPayload fields are copied: topic (lesson title), prompt text, optional teacher-only referenceAnswer,
 * criteria with anchors and the redacted response. commonPhrases, similarity data, ids of the student, enrollment or
 * class never enter it. The fail-closed guard runs here too, so an ineligible payload never becomes a job.
 */
export function buildAssessSnapshot(input: { topic: string; content: unknown; answers: unknown; identities: KnownIdentities }): SnapshotOutcome {
  const prompts: RubricPrompt[] = Array.isArray((input.content as any)?.prompts) ? (input.content as any).prompts : [];
  const answers: Array<{ promptId: string; text: string }> = Array.isArray(input.answers) ? (input.answers as any[]) : [];
  const offsetMaps: Record<string, OffsetMap> = {};
  const payloadPrompts: AssessPromptPayload["prompts"] = [];
  for (const prompt of prompts) {
    const answer = answers.find((a) => a?.promptId === prompt.id);
    if (!answer || typeof answer.text !== "string") return { ok: false, detail: "RESPONSE_MISSING", reasons: [prompt.id] };
    const { text, offsetMap } = redact(answer.text, input.identities);
    if (redactedShare(answer.text, offsetMap) > MAX_REDACTED_SHARE) return { ok: false, detail: "REDACTION_DOMINANT", reasons: [prompt.id] };
    offsetMaps[prompt.id] = offsetMap;
    payloadPrompts.push({
      promptId: prompt.id,
      question: prompt.prompt,
      referenceAnswer: prompt.referenceAnswer ? prompt.referenceAnswer : null,
      criteria: prompt.criteria.map((c) => ({
        criterionCode: c.code,
        description: c.description,
        maxPoints: c.maxPoints,
        anchors: c.anchors.map((a) => ({ points: a.points, description: a.description })),
      })),
      response: text,
    });
  }
  const payload: AssessPromptPayload = { topic: input.topic, prompts: payloadPrompts };
  try {
    assertProviderPayloadSafe(payload, input.identities);
  } catch (error) {
    if (error instanceof PrivacyGuardError) return { ok: false, detail: "IDENTIFIER_IN_PAYLOAD", reasons: error.reasons };
    throw error;
  }
  const snapshot: AssessSnapshotV1 = { version: "assess-snapshot@1", redaction: REDACTION_VERSION, payload, offsetMaps };
  return { ok: true, snapshot, digest: createHash("sha256").update(stable(snapshot)).digest("hex") };
}

/**
 * Identities used for redaction and the guard: the submitting student, every approved member of the class and the
 * class name. Read server-side for each check; never written to the snapshot, request, logs or provider.
 */
export async function loadKnownIdentities(db: any, classId: string, studentId: string): Promise<KnownIdentities> {
  const [classroom, members, student] = await Promise.all([
    db.classroom.findUnique({ where: { id: classId }, select: { name: true } }),
    db.enrollment.findMany({ where: { classId, status: "approved" }, select: { studentId: true } }),
    db.user.findUnique({ where: { id: studentId }, select: { id: true, fullName: true, username: true, email: true } }),
  ]);
  const ids = [...new Set((members as Array<{ studentId: string }>).map((m) => m.studentId).filter((id) => id !== studentId))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, username: true, email: true } }) : [];
  const people = [student, ...users].filter(Boolean).map((u: any) => ({ id: u.id, fullName: u.fullName ?? null, username: u.username ?? null, email: u.email ?? null }));
  return { people, classNames: classroom?.name ? [classroom.name] : [] };
}
