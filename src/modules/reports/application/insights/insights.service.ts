import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { Db } from "../../../../db/db";
import { ownedClass } from "../../../classes/application/class-access";
import { applyPatternVisibility, CURRENT_INSIGHT_VERSION, engineFor, type Insight } from "./index";
import { INSIGHTS_CONFIG, type InsightsConfig } from "./insights-config";
import { loadClassEvidence } from "./insights-loader";

export const insightsQuerySchema = z.object({ status: z.enum(["open", "all"]).default("open") }).strict();

const collator = new Intl.Collator("vi");

/**
 * Teacher read side of TAI-04. Insights are computed on read from immutable evidence by the versioned pure engine;
 * nothing is stored here. Until TAI4-T3 adds acknowledgements, `open` and `all` return the same list.
 */
@Injectable()
export class InsightsService {
  // Explicit tokens: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(Db) private readonly db: Db, @Inject(INSIGHTS_CONFIG) private readonly config: InsightsConfig) {}

  private compute(classId: string, studentId: string, evidence: any[], now: Date): Insight[] {
    const engine = engineFor(CURRENT_INSIGHT_VERSION)!;
    return applyPatternVisibility(engine({ classId, studentId, evidence, now }), this.config.showSuddenUnaidedPass);
  }

  async classInsights(classId: string, query: unknown, actor: { sub: string; role: string }) {
    const { status } = insightsQuerySchema.parse(query ?? {});
    const classroom = await ownedClass(this.db, classId, actor);
    const archived = classroom.status !== "ACTIVE";
    const { members, evidenceByStudent } = await loadClassEvidence(this.db, classId, { withEvidence: !archived });
    const now = new Date();
    const students = [...members]
      .sort((a, b) => collator.compare(a.displayName, b.displayName) || (a.id < b.id ? -1 : 1))
      .map((m) => ({ studentId: m.id, displayName: m.displayName, insights: archived ? [] : this.compute(classId, m.id, evidenceByStudent.get(m.id) ?? [], now) }));
    return { classId, status, classArchived: archived, students };
  }

  async studentInsights(classId: string, studentId: string, query: unknown, actor: { sub: string; role: string }) {
    const { status } = insightsQuerySchema.parse(query ?? {});
    const classroom = await ownedClass(this.db, classId, actor);
    const archived = classroom.status !== "ACTIVE";
    const { members, evidenceByStudent } = await loadClassEvidence(this.db, classId, { studentId, withEvidence: !archived });
    const member = members[0];
    if (!member) throw new NotFoundException({ code: "NOT_FOUND", message: "Không tìm thấy học sinh trong lớp" });
    const insights = archived ? [] : this.compute(classId, member.id, evidenceByStudent.get(member.id) ?? [], new Date());
    return { classId, studentId: member.id, displayName: member.displayName, status, classArchived: archived, insights, acknowledgements: [] as unknown[] };
  }
}
