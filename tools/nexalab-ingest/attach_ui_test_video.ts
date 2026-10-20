import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedUrl } from "../../src/config/database-config";
import { buildPathwaySteps, materializeLegacySteps, validateLessonSteps } from "../../src/modules/lessons/application/pathway";

const apply = process.argv.includes("--apply");
const verifyAll = process.argv.includes("--verify-all");
const chapterCode = process.argv.find((arg) => arg.startsWith("--chapter="))?.slice(10) ?? "01";
if (process.argv.filter((arg) => ["--apply", "--dry-run", "--verify-all"].includes(arg)).length !== 1)
  throw new Error("Pass exactly one of --dry-run, --apply, or --verify-all");
if (!verifyAll && !/^\d{2}$/.test(chapterCode)) throw new Error("Chapter must be a two-digit number");
if (process.env.APP_ENV !== "development")
  throw new Error("UI test video seed requires APP_ENV=development");

const videoUrl = "https://eiotlkegrejjhldsvaqp.supabase.co/storage/v1/object/public/lesson-media/nexalab-ph-demo-under-50mb.mp4";
const video = {
  type: "video",
  url: videoUrl,
  title: "Video minh họa bài giảng (dùng chung để kiểm thử UI)",
  transcript: "Video mẫu dùng chung để kiểm tra giao diện phát video và theo dõi tiến độ. Nội dung video có thể không khớp với bài học.",
};

async function main() {
  const target = new URL(seedUrl(process.env));
  const db = new PrismaClient({ datasourceUrl: seedUrl(process.env) });
  try {
    const lessons = await db.lesson.findMany({
      where: verifyAll ? { subjectId: "khtn", status: "published" } : { id: { startsWith: `dev-khtn8-ch${chapterCode}-lesson-` }, subjectId: "khtn", synthetic: true, status: "published" },
      orderBy: { id: "asc" },
      select: { id: true, title: true, content: true, materials: true, questions: true, labId: true, steps: { select: { id: true, type: true, position: true, required: true, config: true } } },
    });
    if (!lessons.length) throw new Error(`No published synthetic KHTN 8 chapter-${chapterCode} UI-test lessons found`);
    const assignments = await db.assignment.findMany({
      where: { contentType: "lesson", contentId: { in: lessons.map((lesson) => lesson.id) }, status: "ACTIVE" },
      select: { contentId: true, classId: true, targets: { select: { studentId: true } } },
    });
    const plan = lessons.map((lesson) => {
      const existing = Array.isArray(lesson.materials) ? lesson.materials as Array<Record<string, unknown>> : [];
      const materials = [...existing.filter((item) => item.type !== "video"), video];
      const savedVideos = existing.filter((item) => item.type === "video");
      const pathway = buildPathwaySteps(validateLessonSteps(lesson.steps as any) as any);
      const generatedSteps = materializeLegacySteps({
        content: lesson.content,
        materials: materials as Array<{ type: "video" | "pdf" | "image"; url: string; title: string; transcript?: string }>,
        questions: lesson.questions as unknown[],
        labId: lesson.labId,
      });
      return {
        id: lesson.id,
        title: lesson.title,
        priorVideoCount: savedVideos.length,
        hasRequestedVideoUrl: savedVideos.some((item) => item.url === videoUrl),
        activeAssignments: assignments.filter((assignment) => assignment.contentId === lesson.id).map((assignment) => ({ classId: assignment.classId, targetCount: assignment.targets.length })),
        savedSteps: lesson.steps.map(({ id, type, position }) => ({ id, type, position })),
        pathwayPreview: pathway.steps.map((step) => ({
          type: step.type,
          state: step.state,
          videoConfigured: step.type === "VIDEO" && (lesson.steps.find((saved) => saved.type === "VIDEO")?.config as any)?.url === videoUrl,
          videoAvailableNow: step.type === "VIDEO" && step.resource?.url === videoUrl,
        })),
        generatedSteps,
        materials,
      };
    });
    const preview = {
      mode: apply ? "APPLY_UI_TEST_VIDEO" : "DRY_RUN_NO_WRITES",
      databaseTarget: `${target.hostname}${target.pathname}`,
      lessonCount: lessons.length,
      videoUrl,
      lessons: plan.map(({ id, title, priorVideoCount, hasRequestedVideoUrl, activeAssignments, savedSteps, generatedSteps, pathwayPreview }) => ({ id, title, priorVideoCount, hasRequestedVideoUrl, activeAssignments, savedSteps, generatedSteps: generatedSteps.map((step) => ({ type: step.type, position: step.position })), pathwayPreview })),
      writes: apply ? "pending transaction" : 0,
    };
    if (!apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }
    const updated = await db.$transaction(async (tx) => {
      for (const lesson of plan) {
        await tx.lesson.update({ where: { id: lesson.id }, data: { materials: lesson.materials } });
        for (const step of lesson.generatedSteps) {
          const id = `step-${lesson.id}-${step.type.toLowerCase().replace("_", "-")}`;
          await tx.lessonStep.upsert({
            where: { id },
            create: { id, lessonId: lesson.id, type: step.type, position: step.position, required: step.required, config: step.config as any },
            update: { type: step.type, position: step.position, required: step.required, config: step.config as any },
          });
        }
      }
      return tx.lesson.findMany({
        where: { id: { in: plan.map((lesson) => lesson.id) } },
        select: { id: true, materials: true, steps: { select: { id: true, type: true, position: true, config: true } } },
      });
    });
    const valid = updated.length === plan.length && updated.every((lesson) =>
      Array.isArray(lesson.materials) && lesson.materials.some((item: any) => item.type === "video" && item.url === videoUrl) &&
      lesson.steps.some((step) => step.type === "READING" && step.position === 10) &&
      lesson.steps.some((step) => step.type === "VIDEO" && step.position === 20 && (step.config as any).url === videoUrl),
    );
    if (!valid) throw new Error("Post-seed lesson materials/pathway verification failed");
    console.log(JSON.stringify({ ...preview, mode: "SEEDED_UI_TEST_VIDEO_AND_PATHWAY", writes: { lessons: updated.length, lessonSteps: updated.reduce((count, lesson) => count + lesson.steps.length, 0) }, verification: { lessonsWithVideo: updated.length, lessonsWithReadingAndVideoSteps: updated.filter((lesson) => lesson.steps.some((step) => step.type === "READING") && lesson.steps.some((step) => step.type === "VIDEO")).length } }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "UI-test video seed failed");
  process.exitCode = 1;
});
