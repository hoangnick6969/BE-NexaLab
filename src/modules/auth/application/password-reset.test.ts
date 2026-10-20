import { describe, expect, it, vi } from "vitest";
import { hashToken } from "../interface/auth";
import { completePasswordReset, issueResetLink, requestPasswordReset, RESET_TTL_MS } from "./password-reset";

function fakeDb(users: Array<{ id: string; email: string | null; role: string; status: string }>) {
  const sessions: Array<{ id: string; userId: string; kind: string; tokenHash: string; expiresAt: Date }> = [];
  let seq = 0;
  const matches = (s: any, where: any) =>
    (!where.id || s.id === where.id) &&
    (!where.userId || s.userId === where.userId) &&
    (!where.kind || s.kind === where.kind) &&
    (!where.tokenHash || s.tokenHash === where.tokenHash);
  const client: any = {
    sessions,
    user: {
      findUnique: async ({ where }: any) => users.find((u) => u.email === where.email) ?? null,
      update: vi.fn(async () => ({})),
    },
    session: {
      create: async ({ data }: any) => {
        const row = { id: "s" + ++seq, ...data };
        sessions.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const s = sessions.find((row) => row.tokenHash === where.tokenHash);
        return s ? { ...s, user: users.find((u) => u.id === s.userId) } : null;
      },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (let i = sessions.length - 1; i >= 0; i--)
          if (matches(sessions[i], where)) {
            sessions.splice(i, 1);
            count++;
          }
        return { count };
      },
    },
    $transaction: async (work: any) => work(client),
  };
  return client;
}
const tokenFrom = (text: string) => decodeURIComponent(text.match(/reset=([^\s]+)/)![1]);

describe("adult password reset (C2-T4)", () => {
  const adult = { id: "p1", email: "parent@example.test", role: "PARENT", status: "active" };

  it("stores only a hash with a 60-minute expiry and keeps one live link per account", async () => {
    const db = fakeDb([adult]);
    const mails: string[] = [];
    await issueResetLink(db, adult, async (mail) => void mails.push(mail.text));
    await issueResetLink(db, adult, async (mail) => void mails.push(mail.text));
    expect(db.sessions).toHaveLength(1);
    const raw = tokenFrom(mails[1]);
    expect(db.sessions[0].tokenHash).toBe(hashToken(raw));
    expect(JSON.stringify(db.sessions)).not.toContain(raw);
    expect(db.sessions[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(RESET_TTL_MS - 5000);
  });

  it("treats unknown, student and disabled accounts exactly like a sent link", async () => {
    const db = fakeDb([
      { id: "s1", email: "student@example.test", role: "STUDENT", status: "active" },
      { id: "t1", email: "off@example.test", role: "TEACHER", status: "disabled" },
    ]);
    const deliver = vi.fn(async () => undefined);
    for (const email of ["missing@example.test", "student@example.test", "off@example.test"])
      await requestPasswordReset(db, email, deliver);
    expect(deliver).not.toHaveBeenCalled();
    expect(db.sessions).toHaveLength(0);
  });

  it("leaves no reusable token when delivery fails", async () => {
    const db = fakeDb([adult]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await issueResetLink(db, adult, async () => {
        throw new Error("smtp down");
      }),
    ).toBe(false);
    expect(db.sessions).toHaveLength(0);
    spy.mockRestore();
  });

  it("consumes once, revokes every session, and rejects reuse and expiry uniformly", async () => {
    const db = fakeDb([adult]);
    let text = "";
    await issueResetLink(db, adult, async (mail) => void (text = mail.text));
    db.sessions.push({ id: "refresh-1", userId: "p1", kind: "refresh", tokenHash: "x", expiresAt: new Date(Date.now() + 1e6) });
    const raw = tokenFrom(text);
    await completePasswordReset(db, raw, "New-Password-2026!");
    expect(db.user.update).toHaveBeenCalledOnce();
    expect(db.sessions).toHaveLength(0);
    await expect(completePasswordReset(db, raw, "Other-Password-2026!")).rejects.toMatchObject({
      response: { code: "RESET_TOKEN_INVALID" },
    });

    await issueResetLink(db, adult, async (mail) => void (text = mail.text));
    db.sessions[0].expiresAt = new Date(Date.now() - 1000);
    await expect(completePasswordReset(db, tokenFrom(text), "Late-Password-2026!")).rejects.toMatchObject({
      response: { code: "RESET_TOKEN_INVALID" },
    });
    expect(db.user.update).toHaveBeenCalledOnce();
  });
});
