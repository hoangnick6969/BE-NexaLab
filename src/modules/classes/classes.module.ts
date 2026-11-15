import { Module } from "@nestjs/common";
import { AI_ASSESSMENT_CONFIG, parseAiAssessmentConfig } from "../../config/ai-assessment";
import { AssignmentsService } from "./application/assignments.service";
import { ClassExploreService } from "./application/class-explore.service";
import { AssessmentSessionSweeper } from "./application/assessment-sweeper";
import { GradebookService } from "./application/gradebook.service";
import { GradebookController } from "./interface/gradebook.controller";
import { ClassResourcesService } from "./application/class-resources.service";
import { ClassesService } from "./application/classes.service";
import { EnrollmentsService } from "./application/enrollments.service";
import { AssignmentsController } from "./interface/assignments.controller";
import { ClassesController } from "./interface/classes.controller";
import { EnrollmentsController } from "./interface/enrollments.controller";
import { ClassExploreController } from "./interface/class-explore.controller";
import { ClassResourcesController } from "./interface/class-resources.controller";

/**
 * Teacher classes: lifecycle and join codes, enrollment and roster, assignments and class resources. Controllers
 * (interface) only map HTTP; the use cases live in the application services. Teacher reports live in ReportsModule.
 */
@Module({
  controllers: [ClassesController, EnrollmentsController, AssignmentsController, ClassResourcesController, ClassExploreController, GradebookController],
  providers: [
    ClassesService,
    EnrollmentsService,
    AssignmentsService,
    ClassResourcesService,
    ClassExploreService,
    // TAI-07: auto-submits expired graded sessions every minute (off under tests).
    AssessmentSessionSweeper,
    // TAI7-T3: class gradebook, quick-approve, lock and CSV export.
    GradebookService,
    // TAI2-T6: assisted grading reads the shared AI assessment gate (src/config), never the ai module.
    { provide: AI_ASSESSMENT_CONFIG, useFactory: () => parseAiAssessmentConfig(process.env) },
  ],
})
export class ClassesModule {}
