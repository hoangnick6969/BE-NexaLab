import { Module } from "@nestjs/common";
import { AI_ASSESSMENT_CONFIG, parseAiAssessmentConfig } from "../../config/ai-assessment";
import { AI_CREDITS_CONFIG, parseAiCreditsConfig } from "../../config/ai-credits";
import { AI_LAB_CHALLENGE_CONFIG, parseAiLabChallengeConfig } from "../../config/ai-lab-challenge";
import { AiLabChallengesService } from "./application/ai-lab-challenges.service";
import { AiAssessmentsService } from "./application/ai-assessments.service";
import { AiJobRunner } from "./application/ai-job-runner";
import { AiJobsService } from "./application/ai-jobs.service";
import { parseAiConfig } from "./application/ai-config";
import { AI_CONFIG, AI_PROVIDER } from "./application/ai-provider";
import { createAiProvider } from "./infrastructure/create-provider";
import { SimilarityRunsService } from "./application/similarity-runs.service";
import { AdminAiAssessmentController, AiAssessmentsController } from "./interface/ai-assessments.controller";
import { AiCreditsAdminService } from "./application/credits-admin.service";
import { AiCreditsService } from "./application/credits.service";
import { AiJobsController } from "./interface/ai-jobs.controller";
import { AdminCreditsController, CreditsController } from "./interface/credits.controller";
import { SimilarityController } from "./interface/similarity.controller";

/**
 * Teacher AI runtime (TAI-01). Parsing the environment here makes boot fail for AI_PROVIDER=fake in production, and
 * (TAI2-T0) for an AI assessment gate that is enabled without a recorded policy or with an uncovered provider.
 * The runner starts only when a provider is configured and AI_RUNNER_ENABLED is not false.
 * TAI-05 credits (AI_CREDITS_ENABLED, default false) reserve at job creation and settle or refund at the terminal transition.
 */
@Module({
  controllers: [AiJobsController, SimilarityController, AiAssessmentsController, AdminAiAssessmentController, CreditsController, AdminCreditsController],
  providers: [
    { provide: AI_CONFIG, useFactory: () => parseAiConfig(process.env) },
    { provide: AI_ASSESSMENT_CONFIG, useFactory: () => parseAiAssessmentConfig(process.env) },
    { provide: AI_CREDITS_CONFIG, useFactory: () => parseAiCreditsConfig(process.env) },
    { provide: AI_LAB_CHALLENGE_CONFIG, useFactory: () => parseAiLabChallengeConfig(process.env) },
    { provide: AI_PROVIDER, useFactory: (config: ReturnType<typeof parseAiConfig>) => createAiProvider(config), inject: [AI_CONFIG] },
    AiLabChallengesService,
    AiJobsService,
    AiJobRunner,
    SimilarityRunsService,
    AiAssessmentsService,
    AiCreditsService,
    AiCreditsAdminService,
  ],
  exports: [AI_CONFIG, AI_PROVIDER, AiJobsService],
})
export class AiModule {}
