import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../common/decorators";
import { Db } from "../../../db/db";

/** Long enough for a cold pooled connection, short enough that a load balancer probe does not hang. */
export const DATABASE_PROBE_TIMEOUT_MS = 3000;

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class HealthController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(Db) private db: Db) {}

  @Public()
  @Get("health")
  @ApiOperation({ summary: "200 when the API and its database answer; 503 DATABASE_UNAVAILABLE otherwise" })
  async health() {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.db.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("database probe timed out")), DATABASE_PROBE_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      // Class name only: the message can carry connection details.
      console.error("NexaLab health check: database unreachable", (error as any)?.constructor?.name ?? "unknown", (error as any)?.code ?? "");
      throw new ServiceUnavailableException({ code: "DATABASE_UNAVAILABLE", message: "Cơ sở dữ liệu không phản hồi", details: { database: "down" } });
    } finally {
      clearTimeout(timer);
    }
    return { status: "ok", version: "1.0.0", database: "up", databaseLatencyMs: Date.now() - started };
  }
}
