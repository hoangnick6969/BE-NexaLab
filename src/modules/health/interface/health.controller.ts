import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../common/decorators";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class HealthController {
  @Public() @Get("health") health() {
    return { status: "ok", version: "1.0.0" };
  }
}
