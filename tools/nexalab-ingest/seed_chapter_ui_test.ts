import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { seedUrl } from "../../src/database-config";

const inputPath = path.resolve(process.argv.find((arg) => arg.startsWith("--input="))?.slice(8) ?? "tools/nexalab-ingest/out/nxbgd-khtn8-20261015/extracted/sgk-khtn8-chapter-01.content-seed.dev.json");
const apply = process.argv.includes("--apply");
if (process.argv.filter((arg) => arg === "--apply" || arg === "--dry-run").length !== 1) throw new Error("Pass exactly one of --dry-run or --apply");
if (process.env.APP_ENV !== "development") throw new Error("UI test seed requires APP_ENV=development");

const schema = z.object({
  schema: z.literal("nexalab.textbook-content-seed/v1"),
  developmentOnly: z.literal(true),
  source: z.object({ sourceId: z.string() }).passthrough(),
  chapter: z.object({ sourceChapterId: z.string(), title: z.string(), grade: z.number(), sections: z.array(z.object({ sourceSectionId: z.string(), lessonNumber: z.number(), title: z.string(), content: z.object({ text: z.string().min(1), sha256: z.string().regex(/^[A-F0-9]{64}$/) }) })) }),
}).passthrough();
async function main() {
const payload = schema.parse(JSON.parse(await readFile(inputPath, "utf8")));
const chapterCode = payload.chapter.sourceChapterId.match(/^chapter-(\d{2})$/)?.[1];
if (!chapterCode) throw new Error("UI test seed requires a chapter ID in chapter-NN format");
for (const section of payload.chapter.sections) {
  const digest = createHash("sha256").update(section.content.text, "utf8").digest("hex").toUpperCase();
  if (digest !== section.content.sha256) throw new Error(`Content hash mismatch: ${section.sourceSectionId}`);
}

const ebookUrl = "https://eiotlkegrejjhldsvaqp.supabase.co/storage/v1/object/public/lesson-media/sgk-khtn.pdf";
const targetUrl = new URL(seedUrl(process.env));
const preview = { mode: apply ? "DEVELOPMENT_UI_TEST_SEED" : "DRY_RUN_NO_WRITES", databaseTarget: `${targetUrl.hostname}${targetUrl.pathname}`, chapter: payload.chapter.sourceChapterId, sections: payload.chapter.sections.map(({ sourceSectionId, lessonNumber, title, content }) => ({ sourceSectionId, lessonNumber, title, contentCharacters: content.text.length, sha256: content.sha256 })), contentCharacters: payload.chapter.sections.reduce((total, section) => total + section.content.text.length, 0), ebookUrl, reviewStatusAfterApply: "DONE", lessonsStatus: "published", lessonsSynthetic: true, writes: apply ? "pending transaction" : 0 };
if (!apply) { console.log(JSON.stringify(preview, null, 2)); process.exit(0); }

const db = new PrismaClient({ datasourceUrl: seedUrl(process.env) });
try {
  const result = await db.$transaction(async (tx) => {
    const subject = await tx.subject.findUnique({ where: { id: "khtn" } });
    const admin = await tx.user.findUnique({ where: { id: "admin" } });
    if (!subject || !admin) throw new Error("Required KHTN subject/admin fixture is missing");
    if (subject.ebookUrl !== ebookUrl) throw new Error("KHTN subject ebookUrl does not match the requested bucket URL");
    const lessons: string[] = [];
    for (const section of payload.chapter.sections) {
      const chunk = await tx.textbookSourceChunk.findUnique({ where: { sourceId_sourceSectionId: { sourceId: payload.source.sourceId, sourceSectionId: section.sourceSectionId } } });
      if (!chunk || chunk.contentSha256 !== section.content.sha256 || chunk.content !== section.content.text) throw new Error(`Staging chunk missing or differs from input: ${section.sourceSectionId}`);
      await tx.textbookSourceChunk.update({ where: { id: chunk.id }, data: { reviewStatus: "DONE", ocrReviewed: true, studentFacing: true } });
      const id = `dev-khtn8-ch${chapterCode}-lesson-${String(section.lessonNumber).padStart(2, "0")}`;
      const materials = [{ type: "pdf", url: ebookUrl, title: "Sách giáo khoa KHTN 8 (PDF)" }];
      await tx.lesson.upsert({
        where: { id },
        create: { id, subjectId: subject.id, authorId: admin.id, title: `Bài ${section.lessonNumber}. ${section.title}`, chapter: payload.chapter.title, grade: payload.chapter.grade, topic: section.title, learningObjective: "Nội dung thử nghiệm giao diện bài học KHTN 8.", prerequisites: "Dữ liệu kiểm thử giao diện.", curriculum: "KHTN 8 · nội dung OCR development test", content: chunk.content, status: "published", scope: "SHARED_LIBRARY", synthetic: true, materials, publishedAt: new Date() },
        update: { title: `Bài ${section.lessonNumber}. ${section.title}`, chapter: payload.chapter.title, grade: payload.chapter.grade, topic: section.title, content: chunk.content, status: "published", scope: "SHARED_LIBRARY", synthetic: true, materials, publishedAt: new Date() },
      });
      lessons.push(id);
    }
    return { reviewRowsMarkedDone: lessons.length, lessonsUpserted: lessons.length, lessonIds: lessons };
  }, { isolationLevel: "Serializable", maxWait: 15000, timeout: 60000 });
  const savedLessons = await db.lesson.findMany({ where: { id: { in: result.lessonIds } }, select: { id: true, content: true, status: true, synthetic: true, materials: true } });
  if (savedLessons.length !== payload.chapter.sections.length || savedLessons.some((lesson) => !lesson.content || lesson.status !== "published" || !lesson.synthetic || !Array.isArray(lesson.materials) || lesson.materials[0]?.url !== ebookUrl)) throw new Error("Post-seed lesson verification failed");
  const savedChunks = await db.textbookSourceChunk.findMany({ where: { sourceId: payload.source.sourceId, chapterId: payload.chapter.sourceChapterId }, select: { reviewStatus: true, ocrReviewed: true, studentFacing: true } });
  if (savedChunks.length !== payload.chapter.sections.length || savedChunks.some((chunk) => chunk.reviewStatus !== "DONE" || !chunk.ocrReviewed || !chunk.studentFacing)) throw new Error("Post-seed source review verification failed");
  console.log(JSON.stringify({ ...preview, mode: "SEEDED_DEVELOPMENT_UI_TEST", writes: result, verification: { lessonsWithContentAndEbook: savedLessons.length, contentCharacters: savedLessons.reduce((sum, lesson) => sum + lesson.content.length, 0), sourceRowsMarkedDone: savedChunks.length } }, null, 2));
} finally { await db.$disconnect(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "UI test seed failed");
  process.exitCode = 1;
});
