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
  @Post("classes/:id/ai-jobs/:jobId/items/:itemId/decisions")
  @HttpCode(200)
  @ApiOperation({ summary: "Accept, edit or reject one AI item (append-only; latest decision wins)" })
  decide(@Param("id") classId: string, @Param("jobId") jobId: string, @Param("itemId") itemId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.decide(classId, jobId, itemId, req, body);
  }

  @Roles("TEACHER")
  @Post("classes/:id/ai-jobs/:jobId/items/:itemId/apply")
  @HttpCode(200)
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Apply one DRAFT_LAB_CHALLENGE proposal to its draft lesson (once per job; re-validated, replayable)" })
  apply(@Param("id") classId: string, @Param("jobId") jobId: string, @Param("itemId") itemId: string, @Req() req: any) {
    return this.service.applyProposal(classId, jobId, itemId, req);
  }

  @Roles("TEACHER")
  @Post("classes/:id/ai-jobs/:jobId/materialize")
  @HttpCode(201)
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Turn accepted and edited items into one ClassResource DRAFT (once per job)" })
  materialize(@Param("id") classId: string, @Param("jobId") jobId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.materialize(classId, jobId, req, body);
  }

  @Roles("TEACHER")
  @Get("me/ai-quota")
  @ApiOperation({ summary: "Daily and concurrency AI usage for one purpose (default GENERATE_RESOURCE)" })
  quota(@Req() req: any, @Query() query: unknown) {
    return this.service.quota(req, query);
  }
}
