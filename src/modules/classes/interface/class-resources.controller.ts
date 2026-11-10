import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { ClassResourcesService } from "../application/class-resources.service";

@ApiTags("Class Space Resources")
@ApiBearerAuth()
@Controller()
export class ClassResourcesController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(ClassResourcesService) private service: ClassResourcesService) {}

  @Roles("TEACHER", "STUDENT")
  @Get("classes/:id/resources")
  @ApiOperation({ summary: "List class resources under owner or approved member access" })
  list(@Param("id") classId: string, @Req() req: any) {
    return this.service.list(classId, req);
  }

  @Roles("TEACHER", "STUDENT")
  @Get("classes/:id/resources/:resourceId")
  detail(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    return this.service.detail(classId, resourceId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources")
  create(@Param("id") classId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.create(classId, req, body);
  }

  @Roles("TEACHER")
  @Put("classes/:id/resources/:resourceId")
  updateDraft(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.updateDraft(classId, resourceId, req, body);
  }

  @Roles("TEACHER")
  @Delete("classes/:id/resources/:resourceId")
  deleteDraft(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    return this.service.deleteDraft(classId, resourceId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/:resourceId/publish")
  publish(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    return this.service.publish(classId, resourceId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/:resourceId/revise")
  revise(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    return this.service.revise(classId, resourceId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/:resourceId/archive")
  archive(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any) {
    return this.service.archive(classId, resourceId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/import/preview")
  previewImport(@Param("id") classId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.previewImport(classId, req, body);
  }

  @Roles("TEACHER")
  @Post("classes/:id/resources/import")
  importCsv(@Param("id") classId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.importCsv(classId, req, body);
  }

  @Roles("STUDENT")
  @Put("classes/:id/resources/:resourceId/practice")
  savePractice(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.savePractice(classId, resourceId, req, body);
  }

  @Roles("STUDENT")
  @Post("classes/:id/resources/:resourceId/additional-responses")
  @ApiOperation({ summary: "Submit an immutable attempt for all published Class Lab supplementary prompts" })
  submitAdditionalResponse(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.submitAdditionalResponse(classId, resourceId, req, body);
  }

  @Roles("STUDENT")
  @Get("classes/:id/resources/:resourceId/additional-responses/mine")
  myAdditionalResponses(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any, @Query("assignmentId") assignmentId?: string) {
    return this.service.myAdditionalResponses(classId, resourceId, req, assignmentId);
  }

  @Roles("TEACHER")
  @Get("classes/:id/resources/:resourceId/additional-responses")
  @ApiOperation({ summary: "List immutable Class Lab response attempts for the owning teacher" })
  listAdditionalResponses(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Req() req: any, @Query("assignmentId") assignmentId?: string) {
    return this.service.listAdditionalResponses(classId, resourceId, req, assignmentId);
  }

  @Roles("TEACHER")
  @Put("classes/:id/resources/:resourceId/additional-responses/:responseId/grade")
  gradeAdditionalResponse(@Param("id") classId: string, @Param("resourceId") resourceId: string, @Param("responseId") responseId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.gradeAdditionalResponse(classId, resourceId, responseId, req, body);
  }
}

