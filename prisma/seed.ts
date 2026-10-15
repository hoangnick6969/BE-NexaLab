import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { createHash } from "node:crypto";
import { seedUrl } from "../src/database-config";
import { materializeQuizQuestions } from "../src/pathway";
const db = new PrismaClient({ datasourceUrl: seedUrl(process.env) });
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development fixtures must never be seeded in production");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Đặt SEED_PASSWORD ít nhất 12 ký tự");
  const passwordHash = await hash(password);
  const fixturePassword = process.env.SEED_FIXTURE_PASSWORD ?? password;
  if (fixturePassword.length < 12)
    throw new Error("Đặt SEED_FIXTURE_PASSWORD ít nhất 12 ký tự");
  const fixturePasswordHash = await hash(fixturePassword);
  const resetFixtures = process.env.SEED_RESET_FIXTURES === "true";
  for (const [role, name, identifier] of [
    ["ADMIN", "Quản trị NexaLab", "admin@nexalab.local"],
    ["TEACHER", "Cô Nguyễn Minh Anh", "teacher@nexalab.local"],
    ["STUDENT", "Nguyễn An", "nguyenan.8a"],
    ["PARENT", "Phụ huynh Nguyễn An", "parent@nexalab.local"],
  ] as const)
    await db.user.upsert({
      where:
        role === "STUDENT" ? { username: identifier } : { email: identifier },
      create: {
        id: role.toLowerCase(),
        email: role === "STUDENT" ? null : identifier,
        username: role === "STUDENT" ? identifier : null,
        role,
        fullName: name,
        passwordHash,
        consentAt: new Date(),
      },
      update: resetFixtures
        ? {
            passwordHash,
            status: "active",
            mustChangePassword: false,
            temporaryPasswordExpiresAt: null,
          }
        : {},
    });
  const fixtureUsers = [
    {
      id: "teacher-owner",
      email:
        process.env.SEED_TEACHER_OWNER_EMAIL ?? "teacher.owner@nexalab.local",
      fullName: "Teacher Owner",
      role: "TEACHER" as const,
    },
    {
      id: "teacher-outsider",
      email:
        process.env.SEED_TEACHER_OUTSIDER_EMAIL ??
        "teacher.outsider@nexalab.local",
      fullName: "Teacher Outsider",
      role: "TEACHER" as const,
    },
    {
      id: "student-temp",
      username: process.env.SEED_STUDENT_TEMP_USERNAME ?? "student.temp",
      fullName: "Student Temporary",
      role: "STUDENT" as const,
      mustChangePassword: true,
    },
    {
      id: "student-active",
      username: process.env.SEED_STUDENT_ACTIVE_USERNAME ?? "student.active",
      fullName: "Student Active",
      role: "STUDENT" as const,
      mustChangePassword: false,
    },
    {
      id: "student-outsider",
      username:
        process.env.SEED_STUDENT_OUTSIDER_USERNAME ?? "student.outsider",
      fullName: "Student Outsider",
      role: "STUDENT" as const,
      mustChangePassword: false,
    },
  ];
  for (const fixture of fixtureUsers) {
    for (const identity of [fixture.email, fixture.username].filter(Boolean)) {
      const identityOwner = await db.user.findFirst({
        where: { OR: [{ email: identity }, { username: identity }] },
        select: { id: true },
      });
      if (identityOwner && identityOwner.id !== fixture.id)
        throw new Error(`Fixture identity is already used: ${identity}`);
    }
    const data = {
      id: fixture.id,
      email: fixture.email ?? null,
      username: fixture.username ?? null,
      role: fixture.role,
      fullName: fixture.fullName,
      passwordHash: fixturePasswordHash,
      consentAt: new Date(),
      mustChangePassword: fixture.mustChangePassword ?? false,
      temporaryPasswordExpiresAt: fixture.mustChangePassword
        ? new Date(Date.now() + 86400000)
        : null,
    };
    await db.user.upsert({
      where: { id: fixture.id },
      create: data,
      update: resetFixtures
        ? {
            email: data.email,
            username: data.username,
            fullName: data.fullName,
            passwordHash: data.passwordHash,
            mustChangePassword: data.mustChangePassword,
            temporaryPasswordExpiresAt: data.temporaryPasswordExpiresAt,
          }
        : {},
    });
  }
  for (const [id, name] of [
    ["physics", "Vật lý"],
    ["chemistry", "Hóa học"],
    ["biology", "Sinh học"],
  ])
    await db.subject.upsert({
      where: { id },
      create: { id, name },
      update: {},
    });
  const labs = [
    {
      id: "circuit",
      subjectId: "physics",
      title: "Thắp sáng ý tưởng",
      topic: "Định luật Ohm",
      learningObjective: "Lắp mạch điện kín và làm LED sáng an toàn",
      simulationModelRef: "circuit@1.0.0",
    },
    {
      id: "eye",
      subjectId: "biology",
      title: "Thế giới qua đôi mắt",
      topic: "Cấu tạo mắt người",
      learningObjective: "Nhận diện cấu tạo và đường đi của ánh sáng",
      simulationModelRef: "eye@1.0.0",
    },
    {
      id: "chemistry",
      subjectId: "chemistry",
      title: "Những biến đổi kỳ diệu",
      topic: "Phản ứng hóa học",
      learningObjective: "Hiểu tỉ lệ mol và xác định chất dư",
      simulationModelRef: "chemistry@1.0.0",
    },
  ];
  // Synthetic outcome map for development: it exercises coverage denominators
  // and gap lists, and is never reported as the released curriculum map (CF-T5).
  const fixtureOutcomes = [
    { code: "FX8-ENERGY-01", grade: 8, domain: "ENERGY", chapter: "Điện", statement: "Lắp được mạch điện đơn giản và giải thích vai trò của điện trở bảo vệ." },
    { code: "FX8-ENERGY-02", grade: 8, domain: "ENERGY", chapter: "Điện", statement: "Đo và so sánh cường độ dòng điện trong mạch nối tiếp." },
    { code: "FX8-LIVING-01", grade: 8, domain: "LIVING", chapter: "Cơ thể người", statement: "Nêu được đường đi của ánh sáng qua các bộ phận của mắt." },
    { code: "FX8-MATTER-01", grade: 8, domain: "MATTER", chapter: "Phản ứng hóa học", statement: "Dùng hệ số phương trình để xác định chất phản ứng hết và chất dư." },
    { code: "FX8-EARTH_SKY-01", grade: 8, domain: "EARTH_SKY", chapter: "Khí hậu", statement: "Mô tả được một số tác động của biến đổi khí hậu ở địa phương." },
    { code: "FX9-ENERGY-01", grade: 9, domain: "ENERGY", chapter: "Điện từ", statement: "Giải thích được hiện tượng cảm ứng điện từ trong ví dụ quen thuộc." },
    { code: "FX9-MATTER-01", grade: 9, domain: "MATTER", chapter: "Kim loại", statement: "So sánh được mức độ hoạt động hóa học của một số kim loại." },
    { code: "FX9-LIVING-01", grade: 9, domain: "LIVING", chapter: "Di truyền", statement: "Nêu được ý nghĩa của nhiễm sắc thể trong di truyền." },
  ];
  for (const outcome of fixtureOutcomes)
    await db.curriculumOutcome.upsert({
      where: { code: outcome.code },
      create: { ...outcome, synthetic: true },
      update: { synthetic: true },
    });
  const fixtureTaxonomy: Record<string, { domain: string; outcomeCodes: string[] }> = {
    circuit: { domain: "ENERGY", outcomeCodes: ["FX8-ENERGY-01"] },
    eye: { domain: "LIVING", outcomeCodes: ["FX8-LIVING-01"] },
    chemistry: { domain: "MATTER", outcomeCodes: ["FX8-MATTER-01"] },
  };
  for (const l of labs) {
    await db.lab.upsert({ where: { id: l.id }, create: l, update: {} });
    await db.challenge.upsert({
      where: { id: l.id + "_001" },
      create: {
        id: l.id + "_001",
        labId: l.id,
        objective: l.learningObjective,
        constraints: l.id === "circuit" ? { maxCurrentMa: 20 } : { score: 100 },
      },
      update: {},
    });
    await db.lesson.upsert({
      where: { id: "lesson-" + l.id },
      create: {
        id: "lesson-" + l.id,
        authorId: "teacher",
        subjectId: l.subjectId,
        title: l.topic,
        chapter: "Khám phá khoa học tự nhiên",
        grade: 8,
        topic: l.topic,
        learningObjective: l.learningObjective,
        prerequisites: "Kiến thức Khoa học tự nhiên cơ bản",
        curriculum: "GDPT 2018 – Khoa học tự nhiên THCS",
        content:
          l.id === "circuit"
            ? "Dòng điện chỉ chạy qua đường dẫn kín. Trong mô hình này, mỗi LED có sụt áp 2 V. Dòng điện qua một nhánh nối tiếp: I = (U − 2 × số LED) / R. Điện trở giới hạn dòng để bảo vệ LED. Hãy thay đổi từng tham số và ghi lại kết quả."
            : l.id === "eye"
              ? "Ánh sáng đi qua giác mạc, thủy dịch, đồng tử, thể thủy tinh và dịch kính, rồi đến võng mạc. Võng mạc biến ánh sáng thành tín hiệu thần kinh. Dây thần kinh thị giác truyền tín hiệu đến não. Khám phá từng bộ phận trong mô hình minh họa."
              : "Hệ số trong phương trình hóa học biểu thị tỉ lệ số mol. Chất giới hạn quyết định lượng sản phẩm tối đa; chất còn lại có thể dư. Sáu phản ứng trong lab là mô hình giáo dục lý tưởng; không hướng dẫn thực hành với hóa chất thật.",
        labId: l.id,
        status: "published",
        scope: "SHARED_LIBRARY",
        synthetic: true,
        ...fixtureTaxonomy[l.id],
        publishedAt: new Date(),
        questions: [
          {
            prompt:
              l.id === "circuit"
                ? "Khi điện áp không đổi, tăng điện trở thì dòng điện sẽ?"
                : l.id === "eye"
                  ? "Bộ phận nào tiếp nhận ánh sáng và chuyển thành tín hiệu thần kinh?"
                  : "Hệ số phương trình biểu thị tỉ lệ nào?",
            options:
              l.id === "circuit"
                ? ["Giảm", "Tăng", "Không đổi"]
                : l.id === "eye"
                  ? ["Võng mạc", "Củng mạc", "Dây thần kinh thị giác"]
                  : [
                      "Số mol",
                      "Khối lượng luôn bằng nhau",
                      "Thể tích luôn bằng nhau",
                    ],
            answer: 0,
          },
        ],
      },
      // Synthetic fixtures are shared demo content, never released corpus.
      update: { scope: "SHARED_LIBRARY", synthetic: true, ...fixtureTaxonomy[l.id] },
    });
    const seededLesson = await db.lesson.findUniqueOrThrow({
      where: { id: "lesson-" + l.id },
    });
    const seededQuestions = materializeQuizQuestions(seededLesson.questions as Array<Record<string, unknown>>);
    const seededSteps = [
      {
        id: `step-lesson-${l.id}-reading`,
        type: "READING" as const,
        position: 10,
        config: { html: seededLesson.content },
      },
      {
        id: `step-lesson-${l.id}-video`,
        type: "VIDEO" as const,
        position: 20,
        config: {
          title: `Giải thích: ${l.topic}`,
          equivalentText: seededLesson.content,
        },
      },
      {
        id: `step-lesson-${l.id}-cards`,
        type: "STUDY_CARDS" as const,
        position: 30,
        config: {
          cards: [
            {
              id: `${l.id}-objective`,
              front: "Mục tiêu của bài học là gì?",
              back: l.learningObjective,
            },
            {
              id: `${l.id}-idea`,
              front: "Ý chính cần nhớ",
              back: seededLesson.content,
            },
          ],
        },
      },
      {
        id: `step-lesson-${l.id}-quiz`,
        type: "QUIZ" as const,
        position: 40,
        config: { questions: seededQuestions },
      },
      {
        id: `step-lesson-${l.id}-lab`,
        type: "LAB" as const,
        position: 50,
        config: { labId: l.id },
      },
      {
        id: `step-lesson-${l.id}-challenge`,
        type: "CHALLENGE" as const,
        position: 60,
        config: { challengeId: `${l.id}_001` },
      },
    ];
    for (const step of seededSteps)
      await db.lessonStep.upsert({
        where: { id: step.id },
        create: {
          ...step,
          lessonId: seededLesson.id,
          config: step.config as Prisma.InputJsonValue,
        },
        update: {
          type: step.type,
          position: step.position,
          required: true,
          config: step.config as Prisma.InputJsonValue,
        },
      });
  }
  await db.classroom.upsert({
    where: { id: "demo-class" },
    create: {
      id: "demo-class",
      teacherId: "teacher",
      name: "Khoa học tự nhiên 8A",
      grade: 8,
      joinCode: "NEXA8A",
    },
    update: {},
  });
  for (const classroom of [
    {
      id: "class-pilot-a",
      teacherId: "teacher-owner",
      name: "Pilot Science 8A",
      grade: 8,
      joinCode: "PILOT8A",
    },
    {
      id: "class-pilot-b",
      teacherId: "teacher-outsider",
      name: "Pilot Science 8B",
      grade: 8,
      joinCode: "PILOT8B",
    },
  ])
    await db.classroom.upsert({
      where: { id: classroom.id },
      create: classroom,
      update: resetFixtures
        ? {
            teacherId: classroom.teacherId,
            name: classroom.name,
            grade: classroom.grade,
            joinCode: classroom.joinCode,
          }
        : {},
    });
  await db.enrollment.upsert({
    where: {
      classId_studentId: { classId: "demo-class", studentId: "student" },
    },
    create: { classId: "demo-class", studentId: "student", status: "approved", approved: true },
    update: {},
  });
  for (const [classId, studentId] of [
    ["class-pilot-a", "student-temp"],
    ["class-pilot-a", "student-active"],
    ["class-pilot-b", "student-outsider"],
  ])
    await db.enrollment.upsert({
      where: { classId_studentId: { classId, studentId } },
      create: { classId, studentId, status: "approved", approved: true },
      update: resetFixtures ? { status: "approved", approved: true } : {},
    });
  await db.parentLink.upsert({
    where: { parentId_studentId: { parentId: "parent", studentId: "student" } },
    create: { parentId: "parent", studentId: "student" },
    update: {},
  });
  await db.assignment.upsert({
    where: { id: "demo-assignment" },
    create: {
      id: "demo-assignment",
      classId: "demo-class",
      contentId: "circuit",
      contentType: "lab",
      title: "Thử thách: LED sáng an toàn",
      dueDate: new Date(Date.now() + 7 * 86400000),
    },
    update: {},
  });
  await db.assignment.upsert({
    where: { id: "pilot-a-lesson-assignment" },
    create: {
      id: "pilot-a-lesson-assignment",
      classId: "class-pilot-a",
      contentId: "lesson-circuit",
      contentType: "lesson",
      title: "Pilot: Lộ trình mạch điện",
      dueDate: new Date("2027-06-30T00:00:00.000Z"),
    },
    update: {},
  });
  await db.assignment.upsert({
    where: { id: "pilot-a-circuit-assignment" },
    create: {
      id: "pilot-a-circuit-assignment",
      classId: "class-pilot-a",
      contentId: "circuit",
      contentType: "lab",
      title: "Pilot: Safe LED circuit",
      dueDate: new Date(Date.now() + 7 * 86400000),
    },
    update: {},
  });
  // B1: assignments reach students only through their target snapshot.
  for (const assignmentId of ["demo-assignment", "pilot-a-lesson-assignment", "pilot-a-circuit-assignment"]) {
    const assignment = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
    const members = await db.enrollment.findMany({
      where: { classId: assignment.classId, status: "approved" },
      select: { studentId: true },
    });
    for (const { studentId } of members)
      await db.assignmentTarget.upsert({
        where: { assignmentId_studentId: { assignmentId, studentId } },
        create: { assignmentId, studentId },
        update: {},
      });
    const targets = await db.assignmentTarget.findMany({ where: { assignmentId }, select: { studentId: true } });
    await db.assignment.update({
      where: { id: assignmentId },
      data: {
        targetHash: createHash("sha256").update(targets.map((t) => t.studentId).sort().join(",")).digest("hex"),
      },
    });
  }
  console.log(
    "Seed hoàn tất. Fixture users are environment-configured; set SEED_RESET_FIXTURES=true only in non-production to reset fixture passwords.",
  );
}
main().catch(() => {
  console.error("Seed failed; inspect target connectivity, schema and fixture constraints. Credentials redacted.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
