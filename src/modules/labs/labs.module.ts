import { Module } from "@nestjs/common";
import { ProgressModule } from "../progress/progress.module";
import { LabsController } from "./interface/labs.controller";
import { AdminLabsController } from "./interface/admin-labs.controller";
import { LabReleaseReviewsController } from "./interface/lab-release-reviews.controller";
import { LabReleaseService } from "./application/lab-release.service";

/** Virtual labs: previews, attempts, hints/tutor, saved experiments, and admin simulation versions and sim packs. */
@Module({
  imports: [ProgressModule],
  controllers: [LabsController, AdminLabsController, LabReleaseReviewsController],
  providers: [LabReleaseService],
})
export class LabsModule {}
