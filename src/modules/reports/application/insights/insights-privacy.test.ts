import "reflect-metadata";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { audit } from "../../../../common/audit";
import { InsightsController } from "../../interface/insights.controller";
import { findLeaks, INSIGHT_TOKENS } from "./privacy-scan";
import { baseTables, makeDb, quiz, service, setClock, teacher, type Tables } from "./insights-test-kit";

/**
 * TAI4-T7 privacy boundary, the static and in-memory layers: who may reach the routes, who may import the code, what the
 * acknowledgement writes, and the scanner that the integration script runs against student and parent responses.
 */
const SRC = path.resolve(__dirname, "../../../..");

function walk(dir: string, files: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.ts$/.test(name)) files.push(full);
  }
  return files;
}
const rel = (file: string) => path.relative(SRC, file).replace(/\\/g, "/");

describe("insight routes", () => {
  const proto = InsightsController.prototype as any;
  const handlers = Object.getOwnPropertyNames(proto).filter((name) => name !== "constructor" && Reflect.getMetadata("path", proto[name]) !== undefined);

  it("are exactly the four teacher routes", () => {
    expect(handlers.sort()).toEqual(["acknowledge", "classInsights", "replay", "studentInsights"]);
    for (const name of handlers) expect(Reflect.getMetadata("roles", proto[name])).toEqual(["TEACHER"]);
  });
  it("have no export, notification, public or parent-facing variant", () => {
    for (const name of handlers) {
      const route = String(Reflect.getMetadata("path", proto[name]));
      expect(route).not.toMatch(/export|csv|notif|report|parent|child|public/i);
      expect(Reflect.getMetadata("public", proto[name])).toBeFalsy();
    }
  });
  it("are declared by no other controller", () => {
    const offenders = walk(SRC)
      .filter((file) => /\.controller\.ts$/.test(file) && !file.endsWith("insights.controller.ts"))
      .filter((file) => /@(Get|Post|Put|Patch|Delete)\(\s*["'`][^"'`]*(?<!hint-)insight/i.test(readFileSync(file, "utf8")));
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("module isolation", () => {
  it("lets no module outside reports import the insight code", () => {
    const importers = walk(SRC)
      .filter((file) => !rel(file).startsWith("modules/reports/"))
      .filter((file) => /from\s+["'][^"']*reports\/(application\/insights|interface\/insights)/.test(readFileSync(file, "utf8")));
    expect(importers.map(rel)).toEqual([]);
  });
  it("keeps the insight code away from notifications, mail and exports", () => {
    const files = walk(path.join(SRC, "modules/reports/application/insights")).filter((f) => !/\.test\.ts$/.test(f) && !/test-kit\.ts$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const imports = readFileSync(file, "utf8").split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
      expect(imports, rel(file)).not.toMatch(/notification|mail|export|csv|parents/i);
    }
  });
});

describe("what an acknowledgement writes", () => {
  it("never puts the note in the audit row", async () => {
    const rows: any[] = [];
    await audit({ auditLog: { create: async ({ data }: any) => rows.push(data) } }, {
      actor: teacher, action: "insight.acknowledge", targetType: "InsightAcknowledgement", targetId: "x",
      after: { classId: "c1", studentId: "s1", ruleCode: "SCORE_CHANGE_UNUSUAL", ruleVersion: "insights@1", action: "DISMISSED", note: "ghi chú riêng của giáo viên" } as any,
    });
    expect(JSON.stringify(rows[0].after)).not.toContain("ghi chú");
    expect(rows[0].after).toEqual({ classId: "c1", studentId: "s1", ruleCode: "SCORE_CHANGE_UNUSUAL", ruleVersion: "insights@1", action: "DISMISSED" });
  });

  it("touches only the acknowledgement, audit and idempotency tables: scores, progress, attempts and submissions are unchanged", async () => {
    setClock(new Date("2026-11-07T10:00:00.000Z"));
    const t: Tables = baseTables();
    quiz(t, "s1", 1, 60); quiz(t, "s1", 2, 60); quiz(t, "s1", 3, 60); quiz(t, "s1", 4, 90);
    t.notification = [];
    const before = JSON.stringify(Object.fromEntries(Object.entries(t).filter(([name]) => !["insightAcknowledgement", "auditLog", "idempotencyRecord"].includes(name))));
    const svc = service(t);
    const all = (await svc.studentInsights("c1", "s1", { status: "all" }, teacher)).insights;
    await svc.acknowledge("c1", "s1", all[0]!.fingerprint, { user: teacher, headers: { "idempotency-key": "tai04-privacy-0001" } }, { action: "DISMISSED", note: "một ghi chú" });
    await svc.classInsights("c1", { status: "all" }, teacher);
    await svc.replay("c1", "s1", all[0]!.fingerprint, teacher);
    const after = JSON.stringify(Object.fromEntries(Object.entries(t).filter(([name]) => !["insightAcknowledgement", "auditLog", "idempotencyRecord"].includes(name))));
    expect(after).toBe(before);
    expect(t.notification).toEqual([]);
    expect(t.insightAcknowledgement).toHaveLength(1);
  });

  it("never reads a notification table (the fake database has none)", async () => {
    const db = makeDb(baseTables());
    expect(db.notification).toBeUndefined();
  });
});

describe("response scanner", () => {
  it("finds insight words in keys and values at any depth, case-insensitively", () => {
    const body = { ok: true, items: [{ a: 1, nested: { Fingerprint: "x" } }, { text: "Gợi ý: score_change_unusual đã ẩn" }] };
    const leaks = findLeaks(body, INSIGHT_TOKENS);
    expect(leaks.map((l) => [l.path, l.where])).toEqual([["$.items[0].nested.Fingerprint", "key"], ["$.items[1].text", "value"]]);
  });
  it("finds another student's name, id or note text when asked to look for them", () => {
    const body = { children: [{ name: "Tai04 Bình", id: "cmx123" }], note: "ghi chú riêng" };
    expect(findLeaks(body, ["tai04 bình", "cmx123", "ghi chú riêng"]).map((l) => l.token)).toEqual(["tai04 bình", "cmx123", "ghi chú riêng"]);
  });
  it("accepts a clean body, null, numbers, dates and empty tokens", () => {
    expect(findLeaks({ score: 80, at: new Date(), none: null, list: [], text: "Bài làm của em" }, [...INSIGHT_TOKENS, ""])).toEqual([]);
    expect(findLeaks(null, INSIGHT_TOKENS)).toEqual([]);
    expect(findLeaks("plain", INSIGHT_TOKENS)).toEqual([]);
  });
});
