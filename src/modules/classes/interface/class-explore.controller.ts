import { Body, Controller, Get, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../../common/decorators";
import { ClassExploreService } from "../application/class-explore.service";

/** Class Explore (P0 C3.4): student submission and teacher review. Never creates a run, verdict or progress. */
@ApiTags("Classes")
@ApiBearerAuth()
@Controller()
export class ClassExploreController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(ClassExploreService) private service: ClassExploreService) {}

  @Roles("STUDENT")
  @Post("assignments/:id/explore-submissions")
  @ApiOperation({ summary: "Hand in the measured values and explanation of a Class Explore assignment (a retry returns the saved submission)" })
  submit(@Param("id") id: string, @Req() req: any, @Body() body: unknown) {
    return this.service.submit(id, req, body);
  }

  @Roles("TEACHER")
  @Get("classes/:id/assignments/:assignmentId/explore-submissions")
  @ApiOperation({ summary: "Class Explore board: what was asked, each submission and who has not handed in (owner only)" })
  list(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Req() req: any) {
    return this.service.list(id, assignmentId, req);
  }

  @Roles("TEACHER")
  @Put("classes/:id/assignments/:assignmentId/explore-submissions/:submissionId/review")
  @ApiOperation({ summary: "Comment on a Class Explore submission; it becomes REVIEWED (owner only)" })
  review(@Param("id") id: string, @Param("assignmentId") assignmentId: string, @Param("submissionId") submissionId: string, @Req() req: any, @Body() body: unknown) {
    return this.service.review(id, assignmentId, submissionId, req, body);
  }
}
