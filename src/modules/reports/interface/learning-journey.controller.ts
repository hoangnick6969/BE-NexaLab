import { Controller, Get, Inject, NotFoundException, Param, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Roles } from "../../../common/decorators";
import { audit } from "../../../common/audit";
import { Db } from "../../../db/db";
import { ownedClass } from "../../classes/application/class-access";
import { projectJourney } from "../application/learning-journey";

const filterSchema = z.object({ assignmentId: z.string().trim().min(1).max(200).optional(), lessonId: z.string().trim().min(1).max(200).optional() }).strict();
const notFound = () => new NotFoundException({ code: "LEARNING_JOURNEY_NOT_FOUND", message: "Không tìm thấy hành trình học tập" });
const include = { step: { include: { lesson: { select: { id: true, title: true, curriculumOrder: true } } } } } as const;

@ApiTags("learning-journey")
@ApiBearerAuth()
@Controller()
export class LearningJourneyController {
  constructor(@Inject(Db) private readonly db: Db) {}

  @Roles("STUDENT")
  @Get("me/learning-journey")
  async mine(@Query() raw: unknown, @Req() req: any) {
    const filter = filterSchema.parse(raw);
    const rows = await this.db.videoProgressEvidence.findMany({
      where: { studentId: req.user.sub, ...(filter.assignmentId ? { assignmentId: filter.assignmentId } : {}), ...(filter.lessonId ? { step: { lessonId: filter.lessonId } } : {}) },
      include,
    });
    const items = projectJourney(rows as any);
    const current = [...items].reverse().find((item) => item.state !== "COMPLETED") ?? items.at(-1) ?? null;
    return { items, current, nextRecommendedStep: current?.step ?? null };
  }

  @Roles("TEACHER")
  @Get("classes/:classId/learning-journey/summary")
  async summary(@Param("classId") classId: string, @Query() raw: unknown, @Req() req: any) {
    await ownedClass(this.db, classId, req.user);
    const filter = filterSchema.parse(raw);
    const enrollments = await this.db.enrollment.findMany({ where: { classId, status: "approved" }, include: { student: { select: { id: true, fullName: true, username: true } } } });
    const studentIds = enrollments.map((row) => row.studentId);
    const assignmentIds = filter.assignmentId ? [filter.assignmentId] : (await this.db.assignment.findMany({ where: { classId, contentType: "lesson", status: { in: ["ACTIVE", "ARCHIVED"] } }, select: { id: true } })).map((row) => row.id);
    const rows = await this.db.videoProgressEvidence.findMany({ where: { studentId: { in: studentIds }, assignmentId: { in: assignmentIds }, ...(filter.lessonId ? { step: { lessonId: filter.lessonId } } : {}) }, include });
    return enrollments.map(({ student }) => {
      const items = projectJourney(rows.filter((row) => row.studentId === student.id) as any);
      const current = [...items].reverse().find((item) => item.state !== "COMPLETED") ?? items.at(-1) ?? null;
      return { student, status: !items.length ? "NOT_STARTED" : items.every((item) => item.state === "COMPLETED") ? "COMPLETED" : "IN_PROGRESS", currentLesson: current?.lesson ?? null, currentStep: current?.step ?? null, videoCoveragePercent: current?.video.coveragePercent ?? 0, lastActivityAt: current?.lastObservedAt ?? null };
    });
  }

  @Roles("TEACHER")
  @Get("classes/:classId/students/:studentId/learning-journey")
  async student(@Param("classId") classId: string, @Param("studentId") studentId: string, @Query() raw: unknown, @Req() req: any) {
    await ownedClass(this.db, classId, req.user);
    const enrollment = await this.db.enrollment.findFirst({ where: { classId, studentId, status: "approved" } });
    if (!enrollment) throw notFound();
    const filter = filterSchema.parse(raw);
    const assignmentIds = filter.assignmentId ? [filter.assignmentId] : (await this.db.assignment.findMany({ where: { classId, contentType: "lesson", targets: { some: { studentId } } }, select: { id: true } })).map((row) => row.id);
    const rows = await this.db.videoProgressEvidence.findMany({ where: { studentId, assignmentId: { in: assignmentIds }, ...(filter.lessonId ? { step: { lessonId: filter.lessonId } } : {}) }, include });
    await audit(this.db, { actor: req.user, action: "learning_journey.read", targetType: "User", targetId: studentId, after: { classId, assignmentId: filter.assignmentId ?? null } });
    return { studentId, items: projectJourney(rows as any) };
  }
}

