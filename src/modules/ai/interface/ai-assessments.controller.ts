import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { AiAssessmentsService } from "../application/ai-assessments.service";

/**
 * TAI-02 AI rubric suggestions (implementation-contract.md "HTTP contract"). The request route is teacher-only and
 * owner-checked in the service; the evaluation report is admin-only. Students and parents have no route here.
 */
@ApiTags("Teacher AI")
@ApiBearerAuth()
@Controller()
export class AiAssessmentsController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(AiAssessmentsService) private service: AiAssessmentsService) {}

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/ai-assessments")
  @HttpCode(202)
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Request AI rubric suggestions for 1-50 written submissions; returns created jobs and skipped submissions with reasons" })
  request(@Param("id") classId: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.request(classId, assignmentId, req, body);
  }
}

/** TAI2-T5 admin-only shadow evaluation report (Admin<Domain>Controller convention). */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminAiAssessmentController {
  constructor(@Inject(AiAssessmentsService) private service: AiAssessmentsService) {}

  @Get("ai-assessment/evaluation")
  @ApiOperation({ summary: "Shadow evaluation report for a pinned prompt version: MAE, within ±1, per-criterion agreement, evidence verification" })
  evaluation(@Query() query: unknown) {
    return this.service.evaluation(query);
  }
}
