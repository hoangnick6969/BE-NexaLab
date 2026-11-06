import { describe, expect, it } from "vitest";
import { httpsUrlSchema, normalizeResourceContent, parseResourceCsv, practiceKind, labResourceInputSchema, verifyClassLabSnapshot } from "./class-resource-contract";
import { launchSchema, digest } from "../../labs/application/lab-run";
import { validateResourceAttachment } from "./class-lab-resource";

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
    expect(labResourceInputSchema.safeParse({ ...fields, execution: {} }).success).toBe(false);
    expect(labResourceInputSchema.safeParse({ ...fields, reportPrompts: Array(21).fill("Prompt") }).success).toBe(false);
    for (const kind of ["LAB", "DOCUMENT", "REPORT_TEMPLATE", "LINK"] as const) {
      expect(() => parseResourceCsv(kind, "front,back\na,b")).toThrow();
      expect(practiceKind(kind)).toBe(false);
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
