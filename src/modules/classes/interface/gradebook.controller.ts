import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { GradebookService } from "../application/gradebook.service";

/** TAI-07 (TAI7-T3): class gradebook of one test or written assignment (owner teacher only). */
@ApiTags("Classes")
@ApiBearerAuth()
@Controller()
export class GradebookController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(GradebookService) private service: GradebookService) {}

  @Roles("TEACHER")
  @Get("classes/:id/assignments/:assignmentId/gradebook")
  @ApiOperation({ summary: "Class gradebook: status, time used, 10-point scores, AI suggestion state, similarity flags, summary" })
  gradebook(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any) {
    return this.service.gradebook(id, assignmentId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/gradebook/quick-approve")
  @ApiOperation({ summary: "Accept VALID AI suggestions as teacher grades (ACCEPTED_AI, same checks as the grade route)" })
  quickApprove(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.quickApprove(id, assignmentId, req, body);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/gradebook/lock")
  @ApiOperation({ summary: "Chốt sổ điểm: immutable snapshot of the column; grades are refused until unlock" })
  lock(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any) {
    return this.service.lock(id, assignmentId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/gradebook/unlock")
  @ApiOperation({ summary: "Unlock the column with a reason; earlier snapshots stay as history" })
  unlock(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.unlock(id, assignmentId, req, body);
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignments/:assignmentId/gradebook/export.csv")
  @ApiOperation({ summary: "CSV of the locked column in class-list order (UTF-8 BOM; format=vn|standard)" })
  async exportCsv(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Query() query: unknown, @Res({ passthrough: true }) res: any) {
    const { csv, fileName } = await this.service.exportCsv(id, assignmentId, req, query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName.ascii}"; filename*=UTF-8''${encodeURIComponent(fileName.utf8)}`);
    res.setHeader("Cache-Control", "no-store");
    return csv;
  }
}
