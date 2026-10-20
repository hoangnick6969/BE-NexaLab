/**
 * In-app notifications (acc-3, D-ACC-02). Writers call `notify` with the transaction
 * of their domain event, so a notice exists exactly when the event committed. A
 * `dedupKey` makes a writer safe to retry or to run again on read (time-based notices).
 */
export type NotificationType =
  | "ASSIGNMENT_CREATED"
  | "SUBMISSION_RECEIVED"
  | "LATE_SUBMISSION_PENDING"
  | "LATE_REJECTED"
  | "DEADLINE_EXTENDED"
  | "ENROLLMENT_REQUESTED"
  | "ENROLLMENT_APPROVED"
  | "RESOURCE_PUBLISHED"
  | "ASSIGNMENT_DUE_SOON"
  | "ASSIGNMENT_OVERDUE";

export type NotificationInput = {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupKey?: string | null;
};

export const clip = (text: string, max = 160) => (text.length > max ? text.slice(0, max - 1) + "…" : text);

export async function notify(tx: any, items: NotificationInput[]) {
  const rows = items
    .filter((item) => item.recipientId)
    .map((item) => ({ ...item, title: clip(item.title), body: item.body ? clip(item.body, 400) : null, link: item.link ?? null, dedupKey: item.dedupKey ?? null }));
  if (!rows.length) return 0;
  const result = await tx.notification.createMany({ data: rows, skipDuplicates: true });
  return result.count as number;
}
