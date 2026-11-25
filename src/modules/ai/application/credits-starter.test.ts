import { describe, expect, it } from "vitest";
import { parseAiCreditsConfig } from "../../../config/ai-credits";
import { creditOrigin, ensureStarterCredits, grantStarterCredits, starterKey } from "./credits-starter";
import { makeCreditsStore } from "./credits-test-kit";

describe("teacher starter credits", () => {
  it("uses a stable key and maps posting origins", () => {
    expect(starterKey("t1")).toBe("starter:v1:t1");
    expect(creditOrigin({ kind: "GRANT", systemKey: starterKey("t1") })).toBe("STARTER");
    expect(creditOrigin({ kind: "GRANT", systemKey: "payment:momo:o1" })).toBe("PAYMENT");
    expect(creditOrigin({ kind: "GRANT" })).toBe("ADMIN");
    expect(creditOrigin({ kind: "ADJUST" })).toBe("ADMIN");
    expect(creditOrigin({ kind: "RESERVE" })).toBeNull();
  });

  it("respects zero config and rejects invalid values", async () => {
    const db = makeCreditsStore();
    expect(await ensureStarterCredits(db, "t1", { starterCredits: 0 })).toEqual({ granted: false, credits: 0 });
    expect(db.creditTransaction.rows).toHaveLength(0);
    expect(() => parseAiCreditsConfig({ AI_STARTER_CREDITS: "1001" })).toThrow("AI_STARTER_CREDITS");
  });

  it("ignores non-teachers and disabled teachers", async () => {
    const db = makeCreditsStore();
    db.user.rows.push({ id: "s", role: "STUDENT", status: "active" }, { id: "t", role: "TEACHER", status: "disabled" });
    expect(await grantStarterCredits(db, "s", { starterCredits: 10 })).toEqual({ granted: false, credits: 0 });
    expect(await grantStarterCredits(db, "t", { starterCredits: 10 })).toEqual({ granted: false, credits: 0 });
    expect(db.creditTransaction.rows).toHaveLength(0);
  });

  it("grants once, then returns from the indexed pre-check without a transaction", async () => {
    const db = makeCreditsStore();
    db.user.rows.push({ id: "t", role: "TEACHER", status: "active" });
    expect(await ensureStarterCredits(db, "t", { starterCredits: 10 })).toEqual({ granted: true, credits: 10 });
    db.$transaction = async () => { throw new Error("pre-check should return first"); };
    expect(await ensureStarterCredits(db, "t", { starterCredits: 20 })).toEqual({ granted: false, credits: 0 });
    expect(db.creditTransaction.rows.filter((tx: any) => tx.systemKey === starterKey("t"))).toHaveLength(1);
    expect(db.creditAccount.rows.find((a: any) => a.ownerId === "t" && a.kind === "TEACHER_AVAILABLE")?.balance).toBe(10);
  });
});
