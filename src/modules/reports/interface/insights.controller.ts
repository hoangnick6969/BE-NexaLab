import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { InsightsService } from "../application/insights/insights.service";

/**
 * Explainable learning-evidence insights (TAI-04, TAI4-T2). Teacher role only and only for the class owner; students and
 * parents have no route. Reads write nothing; the only write is the append-only acknowledgement (TAI4-T3), which never
 * changes scores, progress or B2 flags.
 */
@ApiTags("teacher-insights")
@ApiBearerAuth()
@Controller()
export class InsightsController {
  constructor(@Inject(InsightsService) private readonly service: InsightsService) {}

  @Roles("TEACHER")
  @Get("classes/:classId/insights")
  @ApiQuery({ name: "status", required: false, enum: ["open", "all"] })
  @ApiOperation({ summary: "Current insights of the approved students of an owned class, ordered by display name" })
  classInsights(@Param("classId") classId: string, @Query() query: unknown, @Req() req: any) {
    return this.service.classInsights(classId, query, req.user);
  }

  @Roles("TEACHER")
  @Get("classes/:classId/students/:studentId/insights")
  @ApiQuery({ name: "status", required: false, enum: ["open", "all"] })
  @ApiOperation({ summary: "Current insights of one approved student of an owned class" })
  studentInsights(@Param("classId") classId: string, @Param("studentId") studentId: string, @Query() query: unknown, @Req() req: any) {
    return this.service.studentInsights(classId, studentId, query, req.user);
  }

  @Roles("TEACHER")
  @Post("classes/:classId/students/:studentId/insights/:fingerprint/acknowledgements")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Acknowledge or dismiss one current insight (append-only, 201); 409 INSIGHT_STALE when new evidence changed it" })
  acknowledge(@Param("classId") classId: string, @Param("studentId") studentId: string, @Param("fingerprint") fingerprint: string, @Req() req: any, @Body() body: unknown) {
    return this.service.acknowledge(classId, studentId, fingerprint, req, body);
  }

  @Roles("TEACHER")
  @Get("classes/:classId/students/:studentId/insights/:fingerprint/replay")
  @ApiOperation({ summary: "Recompute an acknowledged insight as of its first acknowledgement, with its stored rule version" })
  replay(@Param("classId") classId: string, @Param("studentId") studentId: string, @Param("fingerprint") fingerprint: string, @Req() req: any) {
    return this.service.replay(classId, studentId, fingerprint, req.user);
  }
}
