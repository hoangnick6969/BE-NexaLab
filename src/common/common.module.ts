import { Global, Module } from "@nestjs/common";
import { RequestRateLimiter } from "./request-rate-limiter";

/** Cross-cutting request utilities; RequestRateLimiter is one instance per process so every controller shares its buckets. */
@Global()
@Module({
  providers: [RequestRateLimiter],
  exports: [RequestRateLimiter],
})
export class CommonModule {}
