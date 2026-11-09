import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { AiCreditsAdminService } from "../application/credits-admin.service";
import { AiCreditsService } from "../application/credits.service";

/**
 * TAI-05 teacher credit routes (implementation-contract.md "HTTP contract"). Teacher role only; the estimate route also
 * checks class ownership in the service. Responses carry credits only: never tokens, provider names or provider prices.
 */
@ApiTags("Teacher AI")
@ApiBearerAuth()
@Controller()
export class CreditsController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(AiCreditsService) private service: AiCreditsService) {}

  @Roles("TEACHER")
  @Post("classes/:id/ai-jobs/estimate")
  @HttpCode(200)
  @ApiOperation({ summary: "Estimated credits for an AI job request under the active price (owner only, writes nothing)" })
  estimate(@Param("id") classId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.estimate(classId, req, body);
  }

  @Roles("TEACHER")
  @Get("me/credits")
  @ApiOperation({ summary: "Available and reserved credits with transaction history, newest first, cursor-paginated" })
  mine(@Req() req: any, @Query() query: unknown) {
    return this.service.myCredits(req, query);
  }
}

/** TAI-05 admin credit and pricing routes (Admin<Domain>Controller convention); a non-admin gets 403 from the guard. */
@ApiTags("Admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin/credits")
export class AdminCreditsController {
  constructor(@Inject(AiCreditsAdminService) private service: AiCreditsAdminService) {}

  @Get("accounts")
  @ApiOperation({ summary: "Balances and recent transactions of one teacher (?teacherId=)" })
  account(@Query() query: unknown) {
    return this.service.account(query);
  }

  @Post("accounts/:teacherId/grants")
  @HttpCode(201)
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Grant credits to a teacher (credits > 0, reason 5-500); idempotent and audited" })
  grant(@Param("teacherId") teacherId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.grant(teacherId, req, body);
  }

  @Post("accounts/:teacherId/adjustments")
  @HttpCode(201)
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiOperation({ summary: "Signed adjustment (credits != 0, reason 5-500); 409 CREDIT_BALANCE_NEGATIVE if it would overdraw" })
  adjust(@Param("teacherId") teacherId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.adjust(teacherId, req, body);
  }

  @Get("pricing")
  @ApiOperation({ summary: "Pricing versions per purpose, newest first" })
  listPricing(@Query() query: unknown) {
    return this.service.listPricing(query);
  }

  @Post("pricing")
  @HttpCode(201)
  @ApiOperation({ summary: "Create a draft price (the next version of its purpose; evidenceRef required)" })
  createPricing(@Req() req: any, @Body() body: unknown) {
    return this.service.createPricing(req, body);
  }

  @Post("pricing/:id/activate")
  @HttpCode(200)
  @ApiOperation({ summary: "Activate a draft price; the previous active price of the purpose is retired in the same transaction" })
  activatePricing(@Param("id") id: string, @Req() req: any) {
    return this.service.activatePricing(id, req);
  }

  @Post("pricing/:id/retire")
  @HttpCode(200)
  @ApiOperation({ summary: "Retire the active price (new AI jobs are refused with PRICING_NOT_ACTIVE until another is activated)" })
  retirePricing(@Param("id") id: string, @Req() req: any) {
    return this.service.retirePricing(id, req);
  }
}
