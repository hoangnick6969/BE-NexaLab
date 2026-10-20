import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Put, Query, Req, } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { EnrollmentsService } from "../application/enrollments.service";

@ApiTags("Classes")
@ApiBearerAuth()
@Controller()
export class EnrollmentsController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(EnrollmentsService) private service: EnrollmentsService) {}

  // ---------- B1-T2 enrollment and roster ----------
  @Roles("TEACHER")
  @Get("classes/:id/students")
  roster(@Param("id") id: string, @Req() req: any, @Query() query: unknown) {
    return this.service.roster(id, req, query);
  }

  @Roles("TEACHER")
  @Post("classes/:id/students")
  @ApiOperation({
    summary: "Provision a new student account into the class; the temporary password is shown once",
  })
  provisionStudent(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    return this.service.provisionStudent(id, req, body);
  }

  @Roles("TEACHER")
  @Post("classes/:id/enrollments")
  @ApiOperation({
    summary: "Enroll an existing student account by username (approved immediately)",
  })
  enrollExisting(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    return this.service.enrollExisting(id, req, body);
  }

  @Roles("TEACHER")
  @Put("classes/:id/students/:studentId")
  @ApiOperation({
    summary: "Approve, decline or remove a member. Decline/remove require confirm=true.",
  })
  setEnrollmentStatus(@Param("id") id: string, @Param("studentId") studentId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.setEnrollmentStatus(id, studentId, req, body);
  }

  @Roles("TEACHER")
  @Delete("classes/:id/students/:studentId")
  @ApiOperation({
    summary: "Remove a member (soft): access ends, evidence is kept. Requires ?confirm=true.",
  })
  removeMember(@Param("id") id: string, @Param("studentId") studentId: string, @Req() req: any, @Query() query: unknown) {
    return this.service.removeMember(id, studentId, req, query);
  }

  @Roles("TEACHER")
  @Post("classes/:id/students/:studentId/reset-password")
  resetStudentPassword(@Param("id") id: string, @Param("studentId") studentId: string, @Req() req: any) {
    return this.service.resetStudentPassword(id, studentId, req);
  }

  // ---------- B1-T3 join by code ----------
  @Roles("STUDENT")
  @Post("classes/join")
  @ApiOperation({
    summary: "Join a class with a teacher-issued code (UC-AUTH-05)",
  })
  join(@Req() req: any, @Body() body: unknown) {
    return this.service.join(req, body);
  }
}

