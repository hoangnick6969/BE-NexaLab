import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsService, TIME_BASED_SYNC_MS } from "./notifications.service";
import type { NotificationRepository } from "./notification.repository";

// An in-memory port: no Prisma, no Nest. Each sync reads assignedTestStates once, so its call count is the number of syncs.
function setup(tests: Awaited<ReturnType<NotificationRepository["assignedTestStates"]>> = []) {
  const inserted: any[] = [];
  const repo = {
    list: vi.fn(async () => []),
    unreadCount: vi.fn(async () => 2),
    markRead: vi.fn(async () => false),
    exists: vi.fn(async () => false),
    markAllRead: vi.fn(async () => 3),
    insert: vi.fn(async (items: any[]) => (inserted.push(...items), items.length)),
    linkedChildren: vi.fn(async () => [{ id: "s1", fullName: "Nguyễn An" }]),
    assignedTestStates: vi.fn(async () => tests),
  } satisfies NotificationRepository;
  return { service: new NotificationsService(repo), repo, inserted };
}
const student = { sub: "s1", role: "STUDENT" };

describe("notifications service (acc-3)", () => {
  afterEach(() => vi.useRealTimers());

  it("syncs time-based notices at most once per interval per user", async () => {
    vi.useFakeTimers();
    const { service, repo } = setup();
    expect(await service.unreadCount(student)).toBe(2);
    await service.unreadCount(student);
    await service.list(student, 30);
    expect(repo.assignedTestStates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TIME_BASED_SYNC_MS);
    await service.unreadCount(student);
    expect(repo.assignedTestStates).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight sync between concurrent polls and retries after a failure", async () => {
    const { service, repo } = setup();
    repo.assignedTestStates.mockRejectedValueOnce(new Error("pool timeout"));
    const polls = await Promise.allSettled([service.unreadCount(student), service.unreadCount(student)]);
    expect(polls.map((p) => p.status)).toEqual(["rejected", "rejected"]);
    expect(repo.assignedTestStates).toHaveBeenCalledTimes(1);
    expect(await service.unreadCount(student)).toBe(2);
    expect(repo.assignedTestStates).toHaveBeenCalledTimes(2);
  });

  it("never syncs for teachers and admins", async () => {
    const { service, repo } = setup();
    await service.unreadCount({ sub: "t1", role: "TEACHER" });
    expect(repo.assignedTestStates).not.toHaveBeenCalled();
  });

  it("writes due-soon for students and overdue for parents, keyed by deadline revision", async () => {
    const tests = [
      { assignmentId: "a1", title: "Đề 1", className: "8A", status: "DUE_SOON", revision: 1 },
      { assignmentId: "a2", title: "Đề 2", className: "8A", status: "OVERDUE_UNSUBMITTED", revision: 2 },
    ];
    const asStudent = setup(tests);
    await asStudent.service.unreadCount(student);
    expect(asStudent.inserted).toEqual([expect.objectContaining({ type: "ASSIGNMENT_DUE_SOON", dedupKey: "due-soon:a1:1", recipientId: "s1" })]);
    const asParent = setup(tests);
    await asParent.service.unreadCount({ sub: "p1", role: "PARENT" });
    expect(asParent.inserted).toEqual([expect.objectContaining({ type: "ASSIGNMENT_OVERDUE", dedupKey: "overdue:a2:s1:2", recipientId: "p1", title: 'Nguyễn An chưa nộp "Đề 2" đã quá hạn' })]);
  });

  it("reports a missing notice as not found, and an already-read one as success", async () => {
    const { service, repo } = setup();
    await expect(service.markRead(student, "x")).rejects.toMatchObject({ status: 404 });
    repo.exists.mockResolvedValueOnce(true);
    await expect(service.markRead(student, "x")).resolves.toBeUndefined();
  });
});
