import { Module } from "@nestjs/common";
import { AiJobRunner } from "./application/ai-job-runner";
import { AiJobsService } from "./application/ai-jobs.service";
import { parseAiConfig } from "./application/ai-config";
import { AI_CONFIG, AI_PROVIDER } from "./application/ai-provider";
import { createAiProvider } from "./infrastructure/create-provider";
import { AiJobsController } from "./interface/ai-jobs.controller";

/**
 * Teacher AI runtime (TAI-01). Parsing the environment here makes boot fail for AI_PROVIDER=fake in production.
 * The runner starts only when a provider is configured and AI_RUNNER_ENABLED is not false.
 */
@Module({
  controllers: [AiJobsController],
  providers: [
    { provide: AI_CONFIG, useFactory: () => parseAiConfig(process.env) },
    { provide: AI_PROVIDER, useFactory: (config: ReturnType<typeof parseAiConfig>) => createAiProvider(config), inject: [AI_CONFIG] },
    AiJobsService,
    AiJobRunner,
  ],
  exports: [AI_CONFIG, AI_PROVIDER, AiJobsService],
})
export class AiModule {}
