import { describe, expect, it } from "vitest";
import { hashToken } from "../../auth/interface/auth";
import { approvePendingLinks, confirmEmailVerification, EMAIL_VERIFY_TTL_MS, issueEmailVerification } from "./parent-links";

type Parent = { id: string; email: string | null; role: string; status: string; emailVerifiedAt: Date | null };

function fakeDb(parent: Parent, { consent = false } = {}) {
  const sessions: Array<{ id: string; userId: string; kind: string; tokenHash: string; expiresAt: Date }> = [];
  const links = [{ parentId: parent.id, studentId: "s1", status: "pending", revokedAt: null as Date | null }];
  let seq = 0;
  const client: any = {
    sessions,
    links,
    user: {
      findUnique: async () => parent,
      update: async ({ data }: any) => Object.assign(parent, data),
    },
    parentConsent: { findFirst: async () => (consent ? { id: "c1" } : null) },
    parentLink: {
      updateMany: async ({ where, data }: any) => {
        const rows = links.filter((l) => l.parentId === where.parentId && l.status === where.status && !l.revokedAt);
        rows.forEach((l) => Object.assign(l, data));
        return { count: rows.length };
      },
    },
    session: {
      create: async ({ data }: any) => {
        const row = { id: "s" + ++seq, ...data };
        sessions.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const s = sessions.find((row) => row.tokenHash === where.tokenHash);
        return s ? { ...s, user: parent } : null;
      },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (let i = sessions.length - 1; i >= 0; i--)
          if ((!where.id || sessions[i].id === where.id) && (!where.userId || sessions[i].userId === where.userId) && (!where.kind || sessions[i].kind === where.kind) && (!where.tokenHash || sessions[i].tokenHash === where.tokenHash)) {
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
const tokenFrom = (text: string) => decodeURIComponent(text.match(/verifyEmail=([^\s]+)/)![1]);
const newParent = (): Parent => ({ id: "p1", email: "parent@example.test", role: "PARENT", status: "active", emailVerifiedAt: null });

describe("parent link activation (C1 CAP-2)", () => {
  it("keeps a pending link pending on consent alone", async () => {
    const db = fakeDb(newParent(), { consent: true });
    expect(await approvePendingLinks(db, "p1")).toBe(0);
    expect(db.links[0].status).toBe("pending");
  });

  it("keeps a pending link pending on a verified email alone", async () => {
    const parent = { ...newParent(), emailVerifiedAt: new Date() };
    const db = fakeDb(parent);
    expect(await approvePendingLinks(db, "p1")).toBe(0);
    expect(db.links[0].status).toBe("pending");
  });

  it("mails a one-time link, stores only its hash and verifies the email when it is opened", async () => {
    const parent = newParent();
    const db = fakeDb(parent);
    const mails: string[] = [];
    await issueEmailVerification(db, parent, async (mail) => void mails.push(mail.text));
    await issueEmailVerification(db, parent, async (mail) => void mails.push(mail.text));
    expect(db.sessions).toHaveLength(1);
    const raw = tokenFrom(mails[1]);
    expect(db.sessions[0]).toMatchObject({ kind: "email-verify", tokenHash: hashToken(raw) });
    expect(db.sessions[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(EMAIL_VERIFY_TTL_MS - 5000);
    expect(parent.emailVerifiedAt).toBeNull();
    await expect(confirmEmailVerification(db, raw)).resolves.toMatchObject({ verified: true, approvedLinks: 0 });
    expect(parent.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(confirmEmailVerification(db, raw)).rejects.toMatchObject({ response: { code: "EMAIL_VERIFY_TOKEN_INVALID" } });
  });

  it("approves the pending link when verification completes after consent", async () => {
    const parent = newParent();
    const db = fakeDb(parent, { consent: true });
    const mails: string[] = [];
    await issueEmailVerification(db, parent, async (mail) => void mails.push(mail.text));
    await expect(confirmEmailVerification(db, tokenFrom(mails[0]))).resolves.toMatchObject({ approvedLinks: 1 });
    expect(db.links[0].status).toBe("approved");
  });

  it("refuses an expired link and leaves nothing reusable after a failed delivery", async () => {
    const parent = newParent();
    const db = fakeDb(parent);
    const mails: string[] = [];
    await issueEmailVerification(db, parent, async (mail) => void mails.push(mail.text));
    db.sessions[0].expiresAt = new Date(Date.now() - 1000);
    await expect(confirmEmailVerification(db, tokenFrom(mails[0]))).rejects.toMatchObject({ response: { code: "EMAIL_VERIFY_TOKEN_INVALID" } });
    expect(parent.emailVerifiedAt).toBeNull();
    expect(await issueEmailVerification(db, parent, async () => Promise.reject(new Error("smtp down")))).toBe(false);
    expect(db.sessions).toHaveLength(0);
  });
});
