import type { NotificationInput } from "./notify";

/**
 * Builders for the notices that have no committing event (acc-3). One builder per notice keeps the title and
 * dedupKey identical wherever the notice is materialised (the notifications read path and the parent progress
 * panel), so both surfaces share one stored row. The dedupKey carries the deadline revision: an extension
 * yields a fresh notice instead of reusing the old one.
 */
type Test = { assignmentId: string; title: string; className: string; revision: number };

export const dueSoonNotice = (studentId: string, test: Test): NotificationInput => ({
  recipientId: studentId,
  type: "ASSIGNMENT_DUE_SOON",
  title: `Sắp đến hạn: ${test.title}`,
  body: `Lớp ${test.className}`,
  link: `/assignments/${test.assignmentId}`,
  dedupKey: `due-soon:${test.assignmentId}:${test.revision}`,
});

export const overdueNotice = (parentId: string, child: { id: string; fullName: string }, test: Test): NotificationInput => ({
  recipientId: parentId,
  type: "ASSIGNMENT_OVERDUE",
  title: `${child.fullName} chưa nộp "${test.title}" đã quá hạn`,
  body: `Lớp ${test.className}`,
  link: "/progress",
  dedupKey: `overdue:${test.assignmentId}:${child.id}:${test.revision}`,
});
