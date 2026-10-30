import { Body, Controller, Inject, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { LabReleaseService } from "../application/lab-release.service";

/** Human review receipts are written by an authenticated owner or assigned legacy reviewer. */
@ApiTags("Labs")
@ApiBearerAuth()
@Controller("lab-releases")
export class LabReleaseReviewsController {
  constructor(@Inject(LabReleaseService) private releases: LabReleaseService) {}

  @Roles("ADMIN", "TEACHER")
  @Post(":id/reviews")
  @ApiOperation({ summary: "Record an authorized owner's signoff or legacy reviewer decision on the exact release digest" })
  review(@Param("id") releaseId: string, @Req() req: any, @Body() body: unknown) {
    return this.releases.review(releaseId, req, body);
  }
}
