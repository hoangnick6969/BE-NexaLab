import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { httpsUrlSchema, normalizeResourceContent, parseResourceCsv, practiceKind, labResourceInputSchema, verifyClassLabSnapshot } from "./class-resource-contract";
import { launchSchema, digest } from "../../labs/application/lab-run";
import { validateResourceAttachment, validatedCustomParams } from "./class-lab-resource";

describe("rich class resource trust boundaries", () => {
  it("accepts provider HTTPS links and rejects schemes, credentials and unknown fields", () => {
    expect(httpsUrlSchema.parse("https://docs.google.com/document/d/example/edit")).toContain("docs.google.com");
    for (const url of ["http://example.com", "javascript:alert(1)", "https://user:password@example.com", "data:text/html,a"]) expect(httpsUrlSchema.safeParse(url).success).toBe(false);
    expect(() => normalizeResourceContent("LINK", { url: "https://example.com", html: "<script>" })).toThrow();
    expect(() => normalizeResourceContent("DOCUMENT", { source: { type: "upload", assetVersionId: "asset", mime: "application/pdf" } })).toThrow();
  });
  it("rejects client science, malformed teacher text and CSV for richer kinds", () => {
    const fields = { source: { labId: "circuit", releaseId: "release", challengeId: "challenge" }, learningObjective: "Objective", instructions: "Instructions", reportPrompts: [] };
    expect(labResourceInputSchema.safeParse(fields).success).toBe(true);
    expect(labResourceInputSchema.safeParse({ ...fields, customParams: { maxCurrentMa: 10 } }).success).toBe(true);
    expect(labResourceInputSchema.safeParse({ ...fields, customParams: { "bad-key": 10 } }).success).toBe(false);
    expect(labResourceInputSchema.safeParse({ ...fields, customParams: { maxCurrentMa: Infinity } }).success).toBe(false);
    expect(labResourceInputSchema.safeParse({ ...fields, customParams: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`p${i}`, i])) }).success).toBe(false);
    expect(labResourceInputSchema.safeParse({ ...fields, execution: {} }).success).toBe(false);
    expect(labResourceInputSchema.safeParse({ ...fields, reportPrompts: Array(21).fill("Prompt") }).success).toBe(false);
    for (const kind of ["LAB", "DOCUMENT", "REPORT_TEMPLATE", "LINK"] as const) {
      expect(() => parseResourceCsv(kind, "front,back\na,b")).toThrow();
      expect(practiceKind(kind)).toBe(false);
    }
  });
  it("enforces approved pack ranges before a class Lab draft can be stored", () => {
    const pack = { labId: "circuit", modelRef: "circuit@1.0.0", engineVersion: "1.0.0", template: { ranges: { maxCurrentMa: { min: 5, max: 20 }, minLitLeds: { min: 1, max: 3 } } } };
    const config = { labId: "circuit", modelRef: pack.modelRef };
    expect(validatedCustomParams("circuit", pack, config, { maxCurrentMa: 20, minLitLeds: 1 }, { maxCurrentMa: 10 })).toEqual({ maxCurrentMa: 10, minLitLeds: 1 });
    for (const custom of [{ maxCurrentMa: 21 }, { maxCurrentMa: 4 }, { unknown: 10 }]) {
      try { validatedCustomParams("circuit", pack, config, { maxCurrentMa: 20, minLitLeds: 1 }, custom); throw new Error("Expected rejection"); }
      catch (error) { expect(error).toBeInstanceOf(BadRequestException); expect((error as BadRequestException).getStatus()).toBe(400); expect((error as BadRequestException).getResponse()).toMatchObject({ code: "PARAM_OUT_OF_APPROVED_RANGE" }); }
    }
  });
  it("rejects mixed run selectors and verifies the entire pedagogical snapshot", () => {
    expect(launchSchema.safeParse({ challengeId: "c", resourceId: "r" }).success).toBe(true);
    for (const selector of [{ assignmentId: "a", resourceId: "r" }, { releaseId: "x", resourceId: "r" }, { assignmentId: "a", releaseId: "x" }]) expect(launchSchema.safeParse({ challengeId: "c", ...selector }).success).toBe(false);
    const fields = { resourceId: "r", version: 1, title: "Private", lessonId: null, source: { labId: "l", releaseId: "release", challengeId: "c" }, learningObjective: "Objective", instructions: "Instructions", reportPrompts: [] };
    const snapshot = { ...fields, contentDigest: digest(fields) };
    expect(verifyClassLabSnapshot(snapshot)).toEqual(snapshot);
    expect(() => verifyClassLabSnapshot({ ...snapshot, title: "Changed" })).toThrow();
  });
  it("only attaches owner READY media versions with matching extension and MIME", async () => {
    const version: any = { fileName: "activity.pdf", mime: "application/pdf", status: "READY", asset: { ownerId: "teacher", status: "ACTIVE" } };
    const db = { assetVersion: { findUnique: async () => version } };
    const content = { source: { type: "upload", assetVersionId: "version" } };
    await expect(validateResourceAttachment(db, content, "teacher")).resolves.toBeUndefined();
    await expect(validateResourceAttachment(db, content, "outsider")).rejects.toThrow();
    version.status = "QUARANTINED";
    await expect(validateResourceAttachment(db, content, "teacher")).rejects.toThrow();
    version.status = "READY"; version.fileName = "activity.docx";
    await expect(validateResourceAttachment(db, content, "teacher")).rejects.toThrow();
  });
});
