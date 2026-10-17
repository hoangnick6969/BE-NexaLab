import { Controller, Get, Inject } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Db } from "../infra/db";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(@Inject(Db) private db: Db) {}
  @Get("subjects") subjects() {
    return this.db.subject.findMany();
  }
  @Get("labs") labs() {
    return this.db.lab.findMany({
      where: { status: "published" },
      // Lesson-variant challenges belong to their lesson pathway, not the public lab list.
      include: { challenges: { where: { NOT: { id: { contains: "_v-" } } } } },
    });
  }
}
