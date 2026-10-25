import { createHash } from "node:crypto";
import { z } from "zod";
import { ConflictException } from "@nestjs/common";
import { canonical } from "./content-pack";

const jsonObject = z.record(z.string(), z.unknown());
export const structuredLessonSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("structured-lesson-candidate"),
    status: z.string().min(1),
    book: z.object({ key: z.string().min(1).max(200), title: z.string().min(1), author: z.string(), version: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough(),
    chapter: z.object({ id: z.string().min(1).max(200), title: z.string().min(1) }).passthrough(),
    sourceLesson: z.object({ id: z.string().min(1).max(200), title: z.string().min(1) }).passthrough(),
    printedPageRange: jsonObject,
    pdfPageRange: jsonObject,
    sourcePdf: z.string().max(2000),
    ocrCoverage: z.array(jsonObject),
    sourceBlocks: z.array(jsonObject),
    learningContent: z.object({
      sections: z.array(jsonObject),
      summary: z.string(),
      summarySourceBlockIds: z.array(z.string()),
      knowledgeUnits: z.array(jsonObject),
      definitions: z.array(jsonObject),
      formulas: z.array(jsonObject),
      tables: z.array(jsonObject),
      sourceImages: z.array(jsonObject),
      examples: z.array(jsonObject),
      basicExercises: z.array(jsonObject),
    }).passthrough(),
    warnings: z.array(z.string()),
    contentReview: jsonObject.optional(),
  })
  .passthrough()
  .superRefine((lesson, ctx) => {
    if (Buffer.byteLength(JSON.stringify(lesson), "utf8") > 2 * 1024 * 1024)
      ctx.addIssue({ code: "custom", message: "Structured Lesson exceeds 2 MiB" });
  });

export type StructuredLesson = z.infer<typeof structuredLessonSchema>;

export function structuredLessonIdentity(lesson: StructuredLesson) {
  return `${lesson.book.key}:${lesson.chapter.id}:${lesson.sourceLesson.id}`;
}

export async function importStructuredLessons(db: any, inputs: unknown[]) {
  const parsed = inputs.map((input) => structuredLessonSchema.parse(input));
  const identities = parsed.map(structuredLessonIdentity);
  if (new Set(identities).size !== identities.length) throw new ConflictException("Batch contains duplicate source identities");

  const results = [];
  for (const lesson of parsed) {
    const identity = structuredLessonIdentity(lesson);
    const digest = createHash("sha256").update(canonical(lesson)).digest("hex");
    const key = `structured-${createHash("sha256").update(identity).digest("hex").slice(0, 40)}`;
    results.push(await db.$transaction(async (tx: any) => {
      // A source Lesson ID already in the operational catalog is a conflict; never adopt or overwrite it.
      const existingLesson = await tx.lesson.findUnique({ where: { id: lesson.sourceLesson.id }, select: { id: true } });
      if (existingLesson) return { sourceLessonId: lesson.sourceLesson.id, identity, status: "conflict", reason: "Lesson ID already exists" };

      const pack = await tx.contentPack.findUnique({ where: { key } });
      if (!pack) await tx.contentPack.create({ data: { key, grade: 8, domain: "khtn8", title: lesson.sourceLesson.title, namespace: "fixture" } });
      const same = await tx.contentPackVersion.findUnique({ where: { packKey_digest: { packKey: key, digest } } });
      if (same) return { sourceLessonId: lesson.sourceLesson.id, identity, status: "unchanged", draftId: same.id, digest };
      const last = await tx.contentPackVersion.findFirst({ where: { packKey: key }, orderBy: { version: "desc" }, select: { version: true } });
      const draft = await tx.contentPackVersion.create({
        data: { packKey: key, version: (last?.version ?? 0) + 1, digest, manifest: lesson, status: "draft", synthetic: true, outcomeCodes: [] },
      });
      return { sourceLessonId: lesson.sourceLesson.id, identity, status: "imported", draftId: draft.id, digest };
    }));
  }
  return { count: results.length, imported: results.filter((row) => row.status === "imported").length, unchanged: results.filter((row) => row.status === "unchanged").length, conflicts: results.filter((row) => row.status === "conflict").length, results };
}
