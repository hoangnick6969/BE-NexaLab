import { Module } from "@nestjs/common";
import { AssignmentsService } from "./application/assignments.service";
import { ClassResourcesService } from "./application/class-resources.service";
import { ClassesService } from "./application/classes.service";
import { EnrollmentsService } from "./application/enrollments.service";
import { AssignmentsController } from "./interface/assignments.controller";
import { ClassesController } from "./interface/classes.controller";
import { EnrollmentsController } from "./interface/enrollments.controller";
import { ClassResourcesController } from "./interface/class-resources.controller";

/**
 * Teacher classes: lifecycle and join codes, enrollment and roster, assignments and class resources. Controllers
 * (interface) only map HTTP; the use cases live in the application services. Teacher reports live in ReportsModule.
 */
@Module({
  controllers: [ClassesController, EnrollmentsController, AssignmentsController, ClassResourcesController],
  providers: [ClassesService, EnrollmentsService, AssignmentsService, ClassResourcesService],
})
export class ClassesModule {}
