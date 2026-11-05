import { Module } from "@nestjs/common";
import { parseAiConfig } from "./application/ai-config";
import { AI_CONFIG, AI_PROVIDER } from "./application/ai-provider";
import { createAiProvider } from "./infrastructure/create-provider";

/**
 * Teacher AI runtime (TAI-01). T1 provides configuration and the provider port only: parsing the environment here
 * makes boot fail for AI_PROVIDER=fake in production. Job routes, the runner and persistence arrive in TAI-T2.
 */
@Module({
  providers: [
    { provide: AI_CONFIG, useFactory: () => parseAiConfig(process.env) },
    { provide: AI_PROVIDER, useFactory: (config: ReturnType<typeof parseAiConfig>) => createAiProvider(config), inject: [AI_CONFIG] },
  ],
  exports: [AI_CONFIG, AI_PROVIDER],
})
export class AiModule {}
