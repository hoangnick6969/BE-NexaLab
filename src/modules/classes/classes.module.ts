import { Module } from "@nestjs/common";
import { AssignmentsController } from "./interface/assignments.controller";
import { ClassesController } from "./interface/classes.controller";
import { EnrollmentsController } from "./interface/enrollments.controller";
import { ClassResourcesController } from "./interface/class-resources.controller";

/** Teacher classes: lifecycle and join codes, enrollment and roster, assignments. Teacher reports live in ReportsModule. */
@Module({
  controllers: [ClassesController, EnrollmentsController, AssignmentsController, ClassResourcesController],
})
export class ClassesModule {}
