import { Module } from "@nestjs/common";
import { AssignmentsController } from "./assignments.controller";
import { ClassesController } from "./classes.controller";
import { EnrollmentsController } from "./enrollments.controller";
import { ClassResourcesController } from "./class-resources.controller";

/** Teacher classes: lifecycle and join codes, enrollment and roster, assignments. Teacher reports live in ReportsModule. */
@Module({
  controllers: [ClassesController, EnrollmentsController, AssignmentsController, ClassResourcesController],
})
export class ClassesModule {}
