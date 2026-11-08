import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module";
import { HealthModule } from "./modules/health/health.module";
import { StorageModule } from "./modules/storage/storage.module";
import { CommonModule } from "./common/common.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { CurriculumModule } from "./modules/curriculum/curriculum.module";
import { LessonsModule } from "./modules/lessons/lessons.module";
import { LearningModule } from "./modules/learning/learning.module";
import { ProgressModule } from "./modules/progress/progress.module";
import { LabsModule } from "./modules/labs/labs.module";
import { ParentsModule } from "./modules/parents/parents.module";
import { ClassesModule } from "./modules/classes/classes.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { ContentModule } from "./modules/content/content.module";
import { AdminModule } from "./modules/admin/admin.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { StudentAiModule } from "./modules/student-ai/student-ai.module";

/**
 * Composition root. DbModule and CommonModule are global (Db, RequestRateLimiter); every feature module under
 * src/modules owns one domain's controllers (interface), rules and services (application) and adapters
 * (infrastructure). No two routes overlap, so module order does not change route matching.
 */
@Module({
  imports: [
    DbModule,
    HealthModule,
    StorageModule,
    CommonModule,
    StudentAiModule,
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
    NotificationsModule,
  ],
})
export class AppModule {}
