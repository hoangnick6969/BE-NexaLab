import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { access } from "../auth/auth";
import { applicableAssignmentWhere, applicableLessonAssignmentWhere, assignmentQueueOrder, isOverdue } from "../classes/class-access";
import { Db } from "../infra/db";
import { buildPathwaySteps, validateLessonSteps } from "../lessons/pathway";
import { attribution } from "../lessons/lesson-content";
import { ARCHIVED_CONTENT_MESSAGE } from "../lessons/lesson-schema";
import { loadLessonEvidence } from "./progress-projection";
import { withDerivedCompletion } from "./progress";

/** Student access rules shared by the learning, labs, progress and parent controllers (moved from the former ApiController). */
@Injectable()
export class StudentAccessService {
  constructor(@Inject(Db) private db: Db) {}

  async applicableLessonAssignment(lessonId: string, studentId: string, db: any = this.db, assignmentId?: string) {
    return db.assignment.findFirst({
      where: applicableLessonAssignmentWhere(studentId, lessonId, assignmentId),
      orderBy: assignmentQueueOrder,
    });
  }
  /** Q-B1-02: archived content stays open only to students who already started it. */
  async lessonStarted(lessonId: string, studentId: string, db: any = this.db, assignmentId?: string) {
    const stepIds = (await db.lessonStep.findMany({ where: { lessonId }, select: { id: true } })).map((step: any) => step.id);
    const [progress, quiz, practical] = await Promise.all([
      db.stepProgress.count({ where: { studentId, ...(assignmentId ? { assignmentId } : {}), stepId: { in: stepIds }, status: { not: "NOT_STARTED" } } }),
      db.quizAttempt.count({ where: { studentId, lessonId, ...(assignmentId ? { assignmentId } : {}) } }),
      db.attempt.count({ where: { studentId, lessonStepId: { in: stepIds }, ...(assignmentId ? { assignmentId } : {}) } }),
    ]);
    return progress + quiz + practical > 0;
  }
  async studentPathway(id: string, studentId: string, db: any = this.db, assignmentId?: string) {
    const assignment = await this.applicableLessonAssignment(id, studentId, db, assignmentId);
    if (!assignment) throw new NotFoundException({ code: "ASSIGNMENT_NOT_FOUND", message: "Không tìm thấy bài được giao" });
    const lesson = await db.lesson.findFirst({
      where: { id, status: { in: ["published", "archived"] } },
      include: {
        subject: true,
        steps: {
          orderBy: { position: "asc" },
          include: { progress: { where: { studentId, assignmentId: assignment.id } } },
        },
      },
    });
    if (!lesson) throw new NotFoundException("Nội dung không còn khả dụng");
    if (lesson.status === "archived" && !(await this.lessonStarted(id, studentId, db, assignment.id)))
      throw new NotFoundException({ code: "CONTENT_ARCHIVED", message: ARCHIVED_CONTENT_MESSAGE });
    let pathway;
    try {
      validateLessonSteps(lesson.steps as any);
      const evidence = await loadLessonEvidence(db, studentId, id, lesson.steps.map((step: any) => step.id), assignment.id);
      pathway = buildPathwaySteps(withDerivedCompletion(lesson.steps as any, evidence));
    } catch {
      throw new NotFoundException("Nội dung không còn khả dụng");
    }
    const overrides = await db.teacherGateOverride.findMany({
      where: { studentId, assignmentId: assignment.id, revokedAt: null },
      select: { stepId: true, reason: true, createdAt: true },
    });
    const unlocked = new Map(overrides.map((item: any) => [item.stepId, item]));
    pathway.steps = pathway.steps.map((step: any) => {
      const override = unlocked.get(step.id) as any;
      if (!override || step.state !== "LOCKED") return step;
      return {
        ...step,
        state: "IN_PROGRESS",
        lockReasonCode: null,
        teacherUnlocked: true,
        teacherUnlockReason: override.reason,
        teacherUnlockedAt: override.createdAt,
      };
    });
    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        subject: { id: lesson.subject.id, name: lesson.subject.name },
        grade: lesson.grade,
        chapter: lesson.chapter,
        topic: lesson.topic,
        learningObjective: lesson.learningObjective,
        prerequisites: lesson.prerequisites,
        curriculum: lesson.curriculum,
      },
      attribution: attribution(lesson),
      assignment: {
        id: assignment.id,
        dueDate: assignment.dueDate,
        overdue: isOverdue(assignment.dueDate),
      },
      contentArchived: lesson.status === "archived",
      ...pathway,
      updatedAt: new Date().toISOString(),
    };
  }
  /** Retry guidance for the model that produced the result (circuit, chemistry or eye). */
  retryGuidance(labId: string, verdict: string, simulationResult: any): string | null {
    if (verdict === "passed") return null;
    const check = simulationResult?.challengeCheck;
    if (check?.unmet?.includes("maxCurrentMa"))
      return `Thử thách của giáo viên yêu cầu dòng qua mỗi nhánh LED không quá ${check.params.maxCurrentMa} mA. Hãy tăng điện trở.`;
    if (check?.unmet?.includes("minLitLeds"))
      return `Thử thách yêu cầu ít nhất ${check.params.minLitLeds} LED sáng. Hãy thêm LED hoặc nhánh song song an toàn.`;
    if (check?.unmet?.includes("reactionId")) return "Thử thách yêu cầu một phản ứng khác; hãy đọc lại đề bài.";
    if (check?.unmet?.includes("minScore")) return `Cần đạt ít nhất ${check.params.minScore}% để hoàn thành thử thách.`;
    if (labId === "chemistry") {
      if (simulationResult?.experiment === "ph") return "Nhúng quỳ tím vào cả ba lọ rồi xác định tính chất của từng lọ theo màu quan sát được.";
      if (!simulationResult?.extent) return "Chưa có phản ứng xảy ra. Hãy đặt lượng cả hai chất lớn hơn 0.";
      const leftover = simulationResult.limiting === simulationResult.a ? simulationResult.b : simulationResult.a;
      return `Còn ${leftover} dư. Dựa vào hệ số trong phương trình để chỉnh tỉ lệ số mol cho hai chất phản ứng vừa đủ.`;
    }
    if (labId === "eye") return "Còn bộ phận chưa đúng tên. Chuyển sang Khám phá để đọc mô tả từng bộ phận rồi thử lại.";
    if (verdict === "partial" || simulationResult?.status === "LED_OVERLOAD") {
      return "Dòng điện qua LED vượt mức an toàn (> 20 mA). Hãy tăng giá trị điện trở (R ≥ 350Ω) để bảo vệ linh kiện.";
    }
    if (simulationResult?.status === "OPEN_CIRCUIT") {
      return "Mạch điện đang bị hở hoặc thiếu dây nối. Hãy nối kín các linh kiện thành một vòng hoàn chỉnh.";
    }
    if (simulationResult?.status === "SWITCH_OPEN") {
      return "Công tắc đang mở làm ngắt dòng điện. Hãy bấm vào công tắc để đóng mạch.";
    }
    if (simulationResult?.status === "NO_LED") {
      return "Mạch điện chưa có đèn LED. Hãy bổ sung ít nhất một đèn LED vào mạch.";
    }
    if (simulationResult?.status === "LOW_CURRENT") {
      return "Dòng điện quá nhỏ (dưới 1 mA) khiến đèn không sáng. Hãy giảm bớt điện trở hoặc kiểm tra nguồn điện.";
    }
    return "Hãy kiểm tra lại các linh kiện và mối nối trên mạch điện.";
  }
  async readableStudent(id: string, req: any) {
    if (req.user.sub === id || req.user.role === "ADMIN") return;
    if (
      req.user.role === "PARENT" &&
      (await this.db.parentLink.findUnique({
        where: {
          parentId_studentId: { parentId: req.user.sub, studentId: id },
        },
        select: { status: true, revokedAt: true },
      }))?.status === "approved" &&
      !(await this.db.parentLink.findUnique({ where: { parentId_studentId: { parentId: req.user.sub, studentId: id } }, select: { revokedAt: true } }))?.revokedAt
    )
      return;
    if (
      req.user.role === "TEACHER" &&
      (await this.db.enrollment.findFirst({
        where: {
          studentId: id,
          status: "approved",
          classroom: { teacherId: req.user.sub },
        },
      }))
    )
      return;
    throw new ForbiddenException("Không được xem dữ liệu học sinh này");
  }
}
