import { Module } from "@nestjs/common";
import { ProgressModule } from "../progress/progress.module";
import { ParentsController } from "./parents.controller";

/** Parent link codes, consent, linked children and their progress. */
@Module({
  imports: [ProgressModule],
  controllers: [ParentsController],
})
export class ParentsModule {}
