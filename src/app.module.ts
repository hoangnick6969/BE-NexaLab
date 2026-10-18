import { Module } from "@nestjs/common";
import { InfraModule } from "./infra/infra.module";
import { CommonModule } from "./common/common.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { CurriculumModule } from "./curriculum/curriculum.module";
import { LessonsModule } from "./lessons/lessons.module";
import { LearningModule } from "./learning/learning.module";
import { ProgressModule } from "./progress/progress.module";
import { LabsModule } from "./labs/labs.module";
import { ParentsModule } from "./parents/parents.module";
import { ClassesModule } from "./classes/classes.module";
import { ReportsModule } from "./reports/reports.module";
import { AssetsModule } from "./assets/assets.module";
import { ContentModule } from "./content/content.module";
import { AdminModule } from "./admin/admin.module";

/**
 * Composition root. InfraModule and CommonModule are global (Db, RequestRateLimiter); every other module owns one
 * domain's controllers. No two routes overlap, so module order does not change route matching.
 */
@Module({
  imports: [
    InfraModule,
    CommonModule,
    AuthModule,
    UsersModule,
    CurriculumModule,
    LessonsModule,
    LearningModule,
    ProgressModule,
    LabsModule,
    ParentsModule,
    ClassesModule,
    ReportsModule,
    AssetsModule,
    ContentModule,
    AdminModule,
  ],
})
export class AppModule {}
