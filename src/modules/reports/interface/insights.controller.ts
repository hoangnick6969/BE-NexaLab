import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { InsightsService } from "../application/insights/insights.service";

/**
 * Explainable learning-evidence insights (TAI-04, TAI4-T2). Teacher role only and only for the class owner; students and
 * parents have no route. Read-only: no audit rows and no change to scores, progress or B2 flags.
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
}
