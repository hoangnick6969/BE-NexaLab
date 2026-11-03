import { readFileSync } from "node:fs";
import * as argon from "argon2";
import type { PrismaClient } from "@prisma/client";
import { AdminLabsController } from "./admin-labs.controller";
import { LabReleaseService } from "../application/lab-release.service";
import { digest } from "../application/lab-run";

export const FL07_FIXTURE_NOTICE = "TEST FIXTURE ONLY — isolated FL-07 release mechanics; no curriculum or owner approval claim.";
export const FL07_FIXTURE = { student: "fl07.fixture.student", outsider: "fl07.fixture.outsider", password: "FL07-FIXTURE-ONLY-2026!", adminEmail: "fl07-fixture-admin@example.test" };

export function assertFl07IsolatedTarget() {
  const value = process.env.NEXALAB_FL07_TEST_URL;
  if (!value || value !== process.env.NEXALAB_ISOLATED_DATABASE_URL || value !== process.env.DATABASE_URL || value !== process.env.DIRECT_URL)
    throw new Error("FL-07 fixtures require all database URLs to equal NEXALAB_FL07_TEST_URL");
  const target = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.pathname !== "/fl07_isolated") throw new Error("FL-07 fixtures only accept loopback fl07_isolated");
  return value;
}

/** Persists a labelled mechanics release in a dedicated loopback database only. */
export async function seedFl07Fixture(db: PrismaClient) {
  assertFl07IsolatedTarget();
  const candidate = JSON.parse(readFileSync("content/simulation-packs/fl07-candidate.json", "utf8"));
  const passwordHash = await argon.hash(FL07_FIXTURE.password);
  const admin = await db.user.upsert({ where: { email: FL07_FIXTURE.adminEmail }, update: {}, create: { email: FL07_FIXTURE.adminEmail, fullName: "TEST FIXTURE ONLY admin", passwordHash, role: "ADMIN" } });
  const student = await db.user.upsert({ where: { username: FL07_FIXTURE.student }, update: {}, create: { username: FL07_FIXTURE.student, fullName: "TEST FIXTURE ONLY student", passwordHash, role: "STUDENT", grade: 8 } });
  const outsider = await db.user.upsert({ where: { username: FL07_FIXTURE.outsider }, update: {}, create: { username: FL07_FIXTURE.outsider, fullName: "TEST FIXTURE ONLY outsider", passwordHash, role: "STUDENT", grade: 8 } });
  const active = await db.labRelease.findFirst({ where: { labId: candidate.lab.id, status: "ACTIVE" } });
  if (active) return { admin, student, outsider, release: active, candidate };
  await db.subject.upsert({ where: { id: "khtn" }, update: {}, create: { id: "khtn", name: "Khoa học tự nhiên — TEST FIXTURE ONLY" } });
  await db.curriculumChapter.upsert({ where: { code: "FL07-FIXTURE-CH06" }, update: {}, create: { code: "FL07-FIXTURE-CH06", subjectId: "khtn", grade: 8, domain: "ENERGY", title: FL07_FIXTURE_NOTICE, status: "active", synthetic: false } });
  await db.curriculumTopic.upsert({ where: { code: candidate.lab.topicCode }, update: {}, create: { code: candidate.lab.topicCode, chapterCode: "FL07-FIXTURE-CH06", title: FL07_FIXTURE_NOTICE, outcomeCodes: candidate.activity.outcomeCodes, status: "active" } });
  await db.curriculumOutcome.upsert({ where: { code: candidate.activity.outcomeCodes[0] }, update: {}, create: { code: candidate.activity.outcomeCodes[0], grade: 8, domain: "ENERGY", chapter: "TEST FIXTURE ONLY", statement: FL07_FIXTURE_NOTICE, sourceEvidence: { originType: "test_fixture_only" }, status: "active", synthetic: false } });
  const packKey = "fl07-isolated-source";
  await db.$executeRaw`INSERT INTO "ContentPack" ("key", "subjectId", "grade", "domain", "title", "namespace") VALUES (${packKey}, 'khtn', 8, 'ENERGY', ${FL07_FIXTURE_NOTICE}, 'fixture') ON CONFLICT ("key") DO NOTHING`;
  const content = await db.contentPackVersion.upsert({ where: { packKey_version: { packKey, version: 1 } }, update: {}, create: { packKey, version: 1, digest: digest({ notice: FL07_FIXTURE_NOTICE }), manifest: { notice: FL07_FIXTURE_NOTICE }, status: "released", synthetic: false, outcomeCodes: candidate.activity.outcomeCodes, releaseId: "fl07-fixture-content-release" } });
  await db.lesson.upsert({ where: { id: candidate.lessonIds[0] }, update: {}, create: { id: candidate.lessonIds[0], subjectId: "khtn", authorId: admin.id, title: "TEST FIXTURE ONLY — Năng lượng nhiệt", chapter: "TEST FIXTURE ONLY", grade: 8, topic: FL07_FIXTURE_NOTICE, learningObjective: FL07_FIXTURE_NOTICE, prerequisites: "", curriculum: "TEST FIXTURE ONLY", content: FL07_FIXTURE_NOTICE, scope: "SHARED_LIBRARY", status: "published", synthetic: false, curriculumChapterCode: "FL07-FIXTURE-CH06", curriculumTopicCode: candidate.lab.topicCode, outcomeCodes: candidate.activity.outcomeCodes, packVersionId: content.id } });
  const service = new LabReleaseService(db as any), adminLabs = new AdminLabsController(db as any, service), req = { user: { sub: admin.id, role: "ADMIN" } };
  await adminLabs.createLab(req, { ...candidate.lab, title: "TEST FIXTURE ONLY — Năng lượng nhiệt", reason: FL07_FIXTURE_NOTICE });
  const activity = await adminLabs.createPractical(req, { ...candidate.activity, sources: [{ title: FL07_FIXTURE_NOTICE, license: "TEST_ONLY" }] });
  const config = await adminLabs.createVersion(candidate.lab.id, req, { challengeParams: { [candidate.lab.challengeId]: {} }, reason: FL07_FIXTURE_NOTICE, goldenCases: candidate.pack.template.goldenCases.map((item: any) => ({ challengeId: candidate.lab.challengeId, label: item.label, labState: item.state, expectedVerdict: item.expectedVerdict })) });
  const pack = await adminLabs.createSimPack(req, { ...candidate.pack, activityVersionId: activity.id, reason: FL07_FIXTURE_NOTICE });
  await adminLabs.activateVersion(candidate.lab.id, String(config.version), req, { reason: FL07_FIXTURE_NOTICE });
  await adminLabs.activateSimPack(pack.id, req, { reason: FL07_FIXTURE_NOTICE });
  const release = await service.createDraft(candidate.lab.id, req, { reason: FL07_FIXTURE_NOTICE, lessonIds: candidate.lessonIds });
  const evidence = { curriculumMapping: FL07_FIXTURE_NOTICE, sourceReferences: [FL07_FIXTURE_NOTICE], scientificGoldenCases: FL07_FIXTURE_NOTICE, rubric: FL07_FIXTURE_NOTICE, safetyAssessment: FL07_FIXTURE_NOTICE, rightsAssessment: FL07_FIXTURE_NOTICE };
  await service.publish(candidate.lab.id, release.id, req, { reason: FL07_FIXTURE_NOTICE, releaseDigest: release.digest, evidence });
  return { admin, student, outsider, release: await db.labRelease.findUniqueOrThrow({ where: { id: release.id } }), candidate };
}
