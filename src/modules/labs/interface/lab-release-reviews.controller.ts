import { Body, Controller, Inject, Param, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { LabReleaseService } from "../application/lab-release.service";

/** Human review receipts are written only by the authenticated assigned reviewer. */
@ApiTags("Labs")
@ApiBearerAuth()
@Controller("lab-releases")
export class LabReleaseReviewsController {
  constructor(@Inject(LabReleaseService) private releases: LabReleaseService) {}

  @Roles("TEACHER")
  @Post(":id/reviews")
  @ApiOperation({ summary: "Record an authorized teacher's decision on the exact immutable release digest" })
  review(@Param("id") releaseId: string, @Req() req: any, @Body() body: unknown) {
    return this.releases.review(releaseId, req, body);
  }
}
