import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { SimilarityRunsService } from "../application/similarity-runs.service";

/**
 * Submission similarity evidence for written assignments (TAI3-T4, similarity implementation-contract.md).
 * Teacher role only; the class owner is checked in the service. Students and parents have no route.
 */
@ApiTags("Teacher AI")
@ApiBearerAuth()
@Controller()
export class SimilarityController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(SimilarityRunsService) private service: SimilarityRunsService) {}

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/similarity-runs")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Run subsim@1 over the current submissions (201), or return the run for the same input digest (200, replayed)" })
  async create(@Param("id") classId: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Body() body: unknown, @Res({ passthrough: true }) res: any) {
    const result = await this.service.create(classId, assignmentId, req, body);
    res.status(result.replayed ? 200 : 201);
    return result;
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignments/:assignmentId/similarity-runs")
  @ApiOperation({ summary: "Runs newest first with a computed stale flag" })
  list(@Param("id") classId: string, @Param("assignmentId") assignmentId: string, @Req() req: any, @Query() query: unknown) {
    return this.service.list(classId, assignmentId, req, query);
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignments/:assignmentId/similarity-runs/:runId")
  @ApiOperation({ summary: "One run with matches, spans, texts, current reviews and student names (owner only)" })
  detail(@Param("id") classId: string, @Param("assignmentId") assignmentId: string, @Param("runId") runId: string, @Req() req: any) {
    return this.service.detail(classId, assignmentId, runId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/assignments/:assignmentId/similarity-runs/:runId/matches/:matchId/reviews")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Append a NOTED or DISMISSED review to one match (the newest review is current)" })
  review(
    @Param("id") classId: string,
    @Param("assignmentId") assignmentId: string,
    @Param("runId") runId: string,
    @Param("matchId") matchId: string,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    return this.service.review(classId, assignmentId, runId, matchId, req, body);
  }
}
