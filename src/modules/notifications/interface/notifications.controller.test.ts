import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsController, TIME_BASED_SYNC_MS } from "./notifications.controller";

// A Db stub with no assignments: each sync costs one assignment.findMany, so its call count is the number of syncs.
function setup() {
  const findMany = vi.fn(async () => []);
  const db: any = {
    assignment: { findMany },
    parentLink: { findMany: async () => [{ studentId: "s1" }] },
    notification: { count: async () => 2, findMany: async () => [], createMany: async () => ({ count: 0 }) },
  };
  return { controller: new NotificationsController(db), findMany };
}

describe("notification unread count (acc-3)", () => {
  afterEach(() => vi.useRealTimers());

  it("syncs time-based notices at most once per interval per user", async () => {
    vi.useFakeTimers();
    const { controller, findMany } = setup();
    const student = { user: { sub: "s1", role: "STUDENT" } };
    expect(await controller.unreadCount(student)).toEqual({ count: 2 });
    await controller.unreadCount(student);
    await controller.list(student, {});
    expect(findMany).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TIME_BASED_SYNC_MS);
    await controller.unreadCount(student);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight sync between concurrent polls and retries after a failure", async () => {
    const { controller, findMany } = setup();
    const student = { user: { sub: "s1", role: "STUDENT" } };
    findMany.mockRejectedValueOnce(new Error("pool timeout"));
    const polls = await Promise.allSettled([controller.unreadCount(student), controller.unreadCount(student)]);
    expect(polls.map((p) => p.status)).toEqual(["rejected", "rejected"]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(await controller.unreadCount(student)).toEqual({ count: 2 });
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("never syncs for teachers and admins", async () => {
    const { controller, findMany } = setup();
    await controller.unreadCount({ user: { sub: "t1", role: "TEACHER" } });
    expect(findMany).not.toHaveBeenCalled();
  });
});
