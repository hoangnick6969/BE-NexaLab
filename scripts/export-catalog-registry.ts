import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFile } from 'node:fs/promises';

const prisma = new PrismaClient();
const output = process.argv[2] ?? '../NexaLAB_Content tool/catalog-registry.json';
async function main() {
  const [frameworks, chapters, outcomes] = await Promise.all([
    prisma.curriculumFramework.findMany({
      where: { subjects: { some: { subjectId: 'khtn', grade: { in: [8, 9] } } } },
      include: { subjects: { where: { subjectId: 'khtn' }, orderBy: { grade: 'asc' } } },
      orderBy: [{ frameworkKey: 'asc' }, { version: 'asc' }],
    }),
    prisma.curriculumChapter.findMany({ where: { subjectId: 'khtn', grade: { in: [8, 9] }, status: 'active', synthetic: false }, orderBy: [{ grade: 'asc' }, { officialOrder: 'asc' }, { code: 'asc' }] }),
    prisma.curriculumOutcome.findMany({ where: { grade: { in: [8, 9] }, status: 'active', synthetic: false }, orderBy: [{ grade: 'asc' }, { code: 'asc' }] }),
  ]);
  const topics = await prisma.curriculumTopic.findMany({
    where: { status: 'active', chapterCode: { in: chapters.map((chapter) => chapter.code) } },
    orderBy: [{ officialOrder: 'asc' }, { code: 'asc' }],
  });
  await writeFile(output, JSON.stringify({ schemaVersion: 1, source: 'BE Curriculum catalog', exportedAt: new Date().toISOString(), subjectId: 'khtn', grades: [8, 9], frameworks, chapters, topics, outcomes }, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${output}: ${frameworks.length} frameworks, ${chapters.length} chapters, ${topics.length} topics, ${outcomes.length} outcomes`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
