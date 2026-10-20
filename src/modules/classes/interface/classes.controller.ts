import { Body, ConflictException, Controller, Get, Inject, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { ClassesService } from "../application/classes.service";

@ApiTags("Classes")
@ApiBearerAuth()
@Controller()
export class ClassesController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(ClassesService) private service: ClassesService) {}

  // ---------- B1-T1 class lifecycle ----------
  @Roles("STUDENT", "TEACHER", "ADMIN")
  @Get("classes")
  @ApiOperation({
    summary: "Teacher: owned classes with membership counts. Student: own memberships.",
  })
  classes(@Req() req: any, @Query() query: unknown) {
    return this.service.classes(req, query);
  }

  @Roles("TEACHER")
  @Get("classes/:id")
  classDetail(@Param("id") id: string, @Req() req: any) {
    return this.service.classDetail(id, req);
  }

  @Roles("TEACHER")
  @Post("classes")
  @ApiOperation({
    summary: "Create an owned class; the full join code is shown only in this response",
  })
  createClass(@Req() req: any, @Body() body: unknown) {
    return this.service.createClass(req, body);
  }

  @Roles("TEACHER")
  @Put("classes/:id")
  updateClass(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    return this.service.updateClass(id, req, body);
  }

  @Roles("TEACHER")
  @Post("classes/:id/archive")
  @ApiOperation({
    summary: "Archive a class: closes student access immediately and keeps all records",
  })
  archiveClass(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    return this.service.archiveClass(id, req, body);
  }

  @Roles("TEACHER")
  @Post("classes/:id/join-code/rotate")
  @ApiOperation({
    summary: "Issue a new join code; the previous one stops working immediately",
  })
  rotateJoinCode(@Param("id") id: string, @Req() req: any) {
    return this.service.rotateJoinCode(id, req);
  }
}

