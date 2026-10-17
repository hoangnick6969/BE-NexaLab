import { Module } from "@nestjs/common";
import { ProgressModule } from "../progress/progress.module";
import { LabsController } from "./labs.controller";
import { AdminLabsController } from "./admin-labs.controller";

/** Virtual labs: previews, attempts, hints/tutor, saved experiments, and admin simulation versions and sim packs. */
@Module({
  imports: [ProgressModule],
  controllers: [LabsController, AdminLabsController],
})
export class LabsModule {}
