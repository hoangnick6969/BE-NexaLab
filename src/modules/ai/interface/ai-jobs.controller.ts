import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { AiJobsService } from "../application/ai-jobs.service";

/** Teacher AI job routes (TAI-01, implementation-contract.md "HTTP contract"). Teacher role only; owner checked in the service. */
@ApiTags("Teacher AI")
@ApiBearerAuth()
@Controller()
export class AiJobsController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(AiJobsService) private service: AiJobsService) {}

  @Roles("TEACHER")
  @Post("classes/:id/ai-jobs")
  @HttpCode(202)
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Request an AI draft for one lesson of an owned, active class (PENDING job)" })
  create(@Param("id") classId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.create(classId, req, body);
  }

  @Roles("TEACHER")
  @Get("classes/:id/ai-jobs")
  @ApiOperation({ summary: "Owner's AI jobs for this class, newest first, cursor-paginated (items omitted)" })
  list(@Param("id") classId: string, @Req() req: any, @Query() query: unknown) {
    return this.service.list(classId, req, query);
  }

  @Roles("TEACHER")
  @Get("classes/:id/ai-jobs/:jobId")
  @ApiOperation({ summary: "AI job with items, current decisions, flags and lesson staleness" })
  get(@Param("id") classId: string, @Param("jobId") jobId: string, @Req() req: any) {
    return this.service.get(classId, jobId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/ai-jobs/:jobId/cancel")
  @HttpCode(200)
  @ApiOperation({ summary: "Cancel a PENDING or RUNNING AI job; a later provider result is discarded" })
  cancel(@Param("id") classId: string, @Param("jobId") jobId: string, @Req() req: any) {
    return this.service.cancel(classId, jobId, req);
  }

  @Roles("TEACHER")
  @Get("me/ai-quota")
  @ApiOperation({ summary: "Daily and concurrency AI usage for one purpose (default GENERATE_RESOURCE)" })
  quota(@Req() req: any, @Query() query: unknown) {
    return this.service.quota(req, query);
  }
}
