import { Module } from "@nestjs/common";
import { ProgressModule } from "../progress/progress.module";
import { LearningController } from "./interface/learning.controller";

/** Student pathway, quizzes and assigned work; student visibility rules come from ProgressModule's StudentAccessService. */
@Module({
  imports: [ProgressModule],
  controllers: [LearningController],
})
export class LearningModule {}
