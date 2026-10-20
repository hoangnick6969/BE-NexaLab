import { describe, expect, it } from "vitest";
import { clip, notify } from "./notify";

describe("notify (acc-3)", () => {
  it("writes idempotently with skipDuplicates and clips long text", async () => {
    let call: any;
    const tx = { notification: { createMany: async (args: any) => ((call = args), { count: args.data.length }) } };
    const count = await notify(tx, [
      { recipientId: "t1", type: "SUBMISSION_RECEIVED", title: "x".repeat(300), dedupKey: "submission:1" },
      { recipientId: "", type: "SUBMISSION_RECEIVED", title: "dropped: no recipient" },
    ]);
    expect(count).toBe(1);
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({ recipientId: "t1", dedupKey: "submission:1", link: null, body: null });
    expect(call.data[0].title.length).toBe(160);
  });

  it("skips the write when there is nobody to notify", async () => {
    const tx = { notification: { createMany: async () => { throw new Error("must not be called"); } } };
    expect(await notify(tx, [])).toBe(0);
    expect(clip("ngắn")).toBe("ngắn");
  });
});
