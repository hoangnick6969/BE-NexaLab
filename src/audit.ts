/**
 * Transactional audit evidence (B0P-T2, D15). Callers pass the transaction
 * client so the audit row commits or rolls back with the business mutation;
 * an audit write failure therefore aborts the protected mutation.
 *
 * `before`/`after` keep only allowlisted fields. Secrets (passwords, tokens,
 * join/link/reset codes, answer keys, hint bodies, raw simulation payloads)
 * are never listed, and any value that looks like a credential is redacted.
 */
export type AuditOutcome = "success" | "denied" | "failure";
export type AuditActor = { sub: string; role: string } | null | undefined;
export type AuditEvent = {
  actor: AuditActor;
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome?: AuditOutcome;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export const AUDIT_FIELDS = new Set([
  "name",
  "grade",
  "role",
  "status",
  "enrollmentStatus",
  "previousStatus",
  "joinCodeEnabled",
  "requiresApproval",
  "joinCodeRotated",
  "joinCodeIssued",
  "title",
  "dueDate",
  "audience",
  "recipientCount",
  "targetsAdded",
  "targetsRemoved",
  "contentId",
  "contentType",
  "classId",
  "studentId",
  "lessonId",
  "scope",
  "clonedFromId",
  "structureLocked",
  "reviewChecklist",
  "rejoin",
  "archivedAt",
  "enrollments",
  "assignments",
  "evidence",
  "domain",
  "outcomeCodes",
  "challengeParams",
  "reviewKind",
  "releaseReviewsReset",
  "contentVersion",
  "assignmentId",
  "stepId",
  "active",
  // C2 admin operations
  "ownerId",
  "sessionsRevoked",
  "resolutions",
  "nameChanged",
  "statementChanged",
  "labId",
  "version",
  "modelRef",
  "goldenCases",
  "resultCount",
  "license",
  "activeAssignments",
]);

const credentialLike = [
  /NL-[0-9A-Z]{6}-[0-9A-Z]{10}/i,
  /\$argon2/i,
  /^eyJ[A-Za-z0-9_-]{10,}\./,
  /^[0-9a-f]{40,}$/i,
  /^Nexa-[A-Za-z0-9_-]{8,}$/,
];
const MAX_STRING = 200;
const MAX_ARRAY = 100;

function safeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (credentialLike.some((pattern) => pattern.test(value))) return "[REDACTED]";
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
  }
  if (Array.isArray(value))
    return value
      .slice(0, MAX_ARRAY)
      .map(safeValue)
      .filter((item) => item === null || typeof item !== "object");
  // Nested objects are never copied: the diff must stay field-level.
  return undefined;
}

export function auditDiff(input?: Record<string, unknown> | null) {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!AUDIT_FIELDS.has(key)) continue;
    const safe = safeValue(value);
    if (safe !== undefined) out[key] = safe;
  }
  return Object.keys(out).length ? out : null;
}

/** Keeps only the allowlisted keys whose value changed between two records. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Object.keys(after).filter(
    (key) => AUDIT_FIELDS.has(key) && JSON.stringify(safeValue(before[key])) !== JSON.stringify(safeValue(after[key])),
  );
  return {
    before: auditDiff(Object.fromEntries(keys.map((key) => [key, before[key]]))),
    after: auditDiff(Object.fromEntries(keys.map((key) => [key, after[key]]))),
  };
}

export async function audit(tx: any, event: AuditEvent) {
  const reason = event.reason ? String(safeValue(event.reason) ?? "") : null;
  await tx.auditLog.create({
    data: {
      actorId: event.actor?.sub ?? null,
      actorRole: event.actor?.role ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId ?? null,
      outcome: event.outcome ?? "success",
      reason: reason || null,
      before: auditDiff(event.before) ?? undefined,
      after: auditDiff(event.after) ?? undefined,
    },
  });
}
