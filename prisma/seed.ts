import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Đặt SEED_PASSWORD ít nhất 12 ký tự");
  const passwordHash = await hash(password);
  for (const [role, name] of [
    ["ADMIN", "Quản trị NexaLab"],
    ["TEACHER", "Cô Nguyễn Minh Anh"],
    ["STUDENT", "Nguyễn An"],
    ["PARENT", "Phụ huynh Nguyễn An"],
  ] as const)
    await db.user.upsert({
      where: { email: role.toLowerCase() + "@nexalab.local" },
      create: {
        id: role.toLowerCase(),
        email: role.toLowerCase() + "@nexalab.local",
        role,
        fullName: name,
        passwordHash,
        consentAt: new Date(),
      },
      update: {},
    });
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
      update: {},
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
  await db.enrollment.upsert({
    where: {
      classId_studentId: { classId: "demo-class", studentId: "student" },
    },
    create: { classId: "demo-class", studentId: "student", approved: true },
    update: {},
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
  console.log(
    "Seed hoàn tất. Tài khoản: student/teacher/parent/admin@nexalab.local. Mật khẩu lấy từ SEED_PASSWORD.",
  );
}
main().finally(() => db.$disconnect());
