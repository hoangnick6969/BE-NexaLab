/** Shown when assigned or open content has been archived; progress already made stays readable. */
export const ARCHIVED_CONTENT_MESSAGE = "Nội dung này không còn được cập nhật.";

/** Lesson fields written by an admin content operation (C2-T2) or by reassigning a disabled teacher's lessons. */
export function lessonOperationData(lesson: any, action: string, why: string, newOwnerId?: string) {
  if (action === "reassign") return { authorId: newOwnerId };
  if (action === "archive") return { status: "archived", quarantinedAt: null, quarantineReason: null, statusBeforeQuarantine: null };
  if (action === "quarantine")
    return { status: "quarantined", quarantinedAt: new Date(), quarantineReason: why, statusBeforeQuarantine: lesson.status };
  // release: restore the status the lesson had before quarantine.
  return { status: lesson.statusBeforeQuarantine ?? "draft", quarantinedAt: null, quarantineReason: null, statusBeforeQuarantine: null };
}
