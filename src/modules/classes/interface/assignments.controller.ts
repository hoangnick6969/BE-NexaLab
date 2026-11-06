import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Put, Query, Req, } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { AssignmentsService } from "../application/assignments.service";

@ApiTags("Classes")
@ApiBearerAuth()
@Controller()
export class AssignmentsController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(AssignmentsService) private service: AssignmentsService) {}

  // ---------- B1-T5 assignments ----------
  @Roles("TEACHER")
  @Get("classes/:id/assignments")
  classAssignments(@Param("id") id: string, @Req() req: any, @Query() query: unknown) {
    return this.service.classAssignments(id, req, query);
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignments/:assignmentId/test-status")
  @ApiOperation({ summary: "Per-recipient test status, submissions, late reasons and deadline history (owner only)" })
  testStatus(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any) {
    return this.service.testStatus(id, assignmentId, req);
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignments/:assignmentId/written-status")
  @ApiOperation({ summary: "Written task board: per recipient status and current grade (owner only)" })
  writtenStatus(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any) {
    return this.service.writtenStatus(id, assignmentId, req);
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignments/:assignmentId/submissions/:submissionId")
  @ApiOperation({ summary: "Written submission for grading: responses, rubric with anchors, grade history (owner only)" })
  writtenSubmission(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Param("submissionId") submissionId: string, @Req() req: any) {
    return this.service.writtenSubmission(id, assignmentId, submissionId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/submissions/:submissionId/grades")
  @ApiOperation({ summary: "Append a manual rubric grade to a gradeable written submission (owner only)" })
  gradeWritten(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Param("submissionId") submissionId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.gradeWritten(id, assignmentId, submissionId, req, body);
  }

  @Roles("TEACHER")
  @Get("classes/:id/late-queue")
  @ApiOperation({ summary: "Latest late submissions awaiting the owning teacher's decision in one class" })
  lateQueue(@Param("id") id: string, @Req() req: any) {
    return this.service.lateQueue(id, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/late-submissions/:submissionId/reject")
  @ApiOperation({ summary: "Reject the current late submission of one student: score 0, evidence kept" })
  rejectLate(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Param("submissionId") submissionId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.rejectLate(id, assignmentId, submissionId, req, body);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/deadline-revisions")
  @ApiOperation({ summary: "Revise the due date of the same assignment for its whole recipient set; accepts pending late work" })
  reviseDeadline(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.reviseDeadline(id, assignmentId, req, body);
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignable-content")
  @ApiOperation({
    summary: "Published lessons, labs and class tests this teacher may assign",
  })
  assignableContent(@Param("id") id: string, @Req() req: any) {
    return this.service.assignableContent(id, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments")
  @ApiOperation({
    summary: "Assign a published lesson, lab or class test to approved members or a subset (MSG-31 count)",
  })
  assign(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    return this.service.assign(id, req, body);
  }

  @Roles("TEACHER")
  @Put("classes/:id/assignments/:assignmentId")
  @ApiOperation({
    summary: "Update title, due date or target set; evidence is never deleted",
  })
  updateAssignment(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.updateAssignment(id, assignmentId, req, body);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/archive")
  @ApiOperation({
    summary: "Archive an assignment: it leaves student queues, evidence and history remain",
  })
  archiveAssignment(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.archiveAssignment(id, assignmentId, req, body);
  }
}

