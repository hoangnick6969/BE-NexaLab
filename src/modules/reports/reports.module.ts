import { Module } from "@nestjs/common";
import { INSIGHTS_CONFIG, parseInsightsConfig } from "./application/insights/insights-config";
import { InsightsService } from "./application/insights/insights.service";
import { ClassEvidenceController } from "./interface/class-evidence.controller";
import { ClassProgressController } from "./interface/class-progress.controller";
import { InsightsController } from "./interface/insights.controller";

/**
 * Teacher-facing class reports: assignment progress board, analytics, evidence review with support flags, and the
 * TAI-04 insights. Parsing the environment here stops boot when INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS is invalid.
 */
@Module({
  controllers: [ClassProgressController, ClassEvidenceController, InsightsController],
  providers: [{ provide: INSIGHTS_CONFIG, useFactory: () => parseInsightsConfig(process.env) }, InsightsService],
})
export class ReportsModule {}
