// TAI6-T5 golden evaluation of lab-challenge proposals. Runs a fixed synthetic set of lessons through the pinned
// draft-lab-challenge prompt, the provider port (deterministic FakeAiProvider fed with fixed proposals) and the same
// pure LV-01..LV-09 pipeline the job runner uses, then re-verifies every KEPT proposal independently against
// challengeParamErrors and a direct evaluate() call. Exit code 1 when a kept proposal is out of range or not engine
// verified, which must be impossible by construction.
//
// Provider: the existing deterministic FakeAiProvider (team lead decision 2026-11-09 for G-6: reproducible, no network,
// no data leaves the machine). There is NO live-provider path here, and no lecturer labels exist: the report states that
// the 70% "sensible and appropriate" gate is NOT assessed. No database is read or written.
//
//   npx tsx scripts/tai06-golden-eval.ts                      (report on stdout)
//   npx tsx scripts/tai06-golden-eval.ts --out <report.md> [--json]
import { writeFileSync } from "node:fs";
import { evaluate } from "../src/modules/labs/application/simulation-versions";
import { CHALLENGE_PARAMETERS, challengeParamErrors } from "../src/modules/lessons/application/lesson-content";
import { buildLabChallengeUser, DRAFT_LAB_CHALLENGE_SYSTEM, LAB_CHALLENGE_JSON_SCHEMA } from "../src/modules/ai/application/lab-challenge-prompt";
import { LAB_CHALLENGE_MAX_OUTPUT_TOKENS, LAB_CHALLENGE_PROMPT_VERSION } from "../src/modules/ai/application/lab-challenge-contract";
import { buildLabChallengeSnapshot, offeredModels, processLabChallengeOutput } from "../src/modules/ai/application/lab-challenge-validation";
import { selectLabContext, type LabContext } from "../src/modules/ai/application/lab-reference-states";
import { FakeAiProvider } from "../src/modules/ai/infrastructure/fake-provider";

type Proposal = { labId: string; challengeParams: Record<string, number | string>; rationale: string; outcomeCodes: string[]; sourceRefs: string[] };
const p = (labId: string, challengeParams: Proposal["challengeParams"], rationale: string): Proposal => ({ labId, challengeParams, rationale, outcomeCodes: [], sourceRefs: ["P1"] });

/** Three synthetic lessons. Each provider output mixes sensible proposals with the failure classes the pipeline must drop. */
const LESSONS = [
  {
    id: "golden-circuit", title: "Mạch điện đơn giản", topic: "Dòng điện", learningObjective: "Mắc mạch kín có LED và giới hạn dòng điện qua LED",
    content: "<p>Dòng điện chạy trong mạch kín. LED chỉ sáng khi dòng điện đủ lớn nhưng không vượt quá giới hạn an toàn.</p>",
    output: [
      p("circuit", { maxCurrentMa: 20 }, "Giới hạn 20 mA là mức tối đa an toàn của LED; học sinh chọn điện trở phù hợp."),
      p("circuit", { maxCurrentMa: 15 }, "Dòng 15 mA yêu cầu tính điện trở từ hiệu điện thế nguồn."),
      p("circuit", { maxCurrentMa: 10, minLitLeds: 1 }, "Dòng 10 mA buộc học sinh tăng điện trở."),
      p("circuit", { maxCurrentMa: 25 }, "Ngoài khoảng cho phép (bị loại)."),
      p("circuit", { maxCurrentMa: 5, minLitLeds: 3 }, "Ba LED cùng sáng với 5 mA: không có trạng thái tham chiếu nào đạt (bị loại)."),
      p("chemistry", { reactionId: "mg-hcl" }, "Phòng hóa không liên quan mạch điện nhưng nằm trong danh sách cho phép."),
    ],
  },
  {
    id: "golden-chemistry", title: "Phản ứng hóa học", topic: "Chất và sự biến đổi", learningObjective: "Chọn lượng chất để phản ứng xảy ra vừa đủ",
    content: "<p>Phản ứng xảy ra vừa đủ khi tỉ lệ mol các chất tham gia đúng hệ số trong phương trình.</p>",
    output: [
      p("chemistry", { reactionId: "mg-hcl" }, "Mg và HCl: tỉ lệ 1 : 2 dễ kiểm tra bằng sủi bọt khí."),
      p("chemistry", { reactionId: "naoh-hcl" }, "Phản ứng trung hòa tỉ lệ 1 : 1, phù hợp để bắt đầu."),
      p("chemistry", { reactionId: "cuso4-naoh" }, "Kết tủa xanh giúp học sinh quan sát chất dư."),
      p("chemistry", { experiment: "ph" }, "Nhận biết axit, trung tính, bazơ bằng quỳ tím."),
      p("chemistry", { reactionId: "unknown-reaction" }, "Phản ứng không có trong danh sách (bị loại)."),
      p("eye", { minScore: 80 }, "Phòng thực hành mắt không phù hợp bài hóa nhưng được phép."),
    ],
  },
  {
    id: "golden-eye", title: "Cấu tạo của mắt", topic: "Cơ thể người", learningObjective: "Gọi đúng tên các bộ phận của mắt",
    content: "<p>Mắt gồm giác mạc, thủy dịch, đồng tử, thể thủy tinh, dịch kính, võng mạc, dây thần kinh thị giác và củng mạc.</p>",
    output: [
      p("eye", { minScore: 100 }, "Gọi đúng cả tám bộ phận để đạt."),
      p("eye", { minScore: 80 }, "Chấp nhận sai một bộ phận."),
      p("eye", { minScore: 50 }, "Mức đạt thấp cho lần học đầu."),
      p("eye", { minScore: 55 }, "Sai bước 10 (bị loại)."),
      p("eye", { minScore: 40 }, "Dưới giá trị tối thiểu (bị loại)."),
      p("circuit", { maxCurrentMa: 12 }, "Gợi ý mạch điện cho bài về mắt (được phép nhưng ít liên quan)."),
    ],
  },
];

async function main() {
  const labIds = ["circuit", "chemistry", "eye"];
  const contexts = new Map<string, LabContext>(labIds.map((labId) => [labId, selectLabContext(labId, [], [])!]));
  const models = offeredModels(contexts);
  const rows: Array<Record<string, unknown>> = [];
  let generated = 0;
  let kept = 0;
  const droppedByReason: Record<string, number> = {};
  const failures: string[] = [];

  for (const lesson of LESSONS) {
    const snapshot = buildLabChallengeSnapshot(
      { id: lesson.id, title: lesson.title, grade: 8, domain: "ENERGY", topic: lesson.topic, learningObjective: lesson.learningObjective, content: lesson.content, outcomeCodes: [], readingSteps: [] },
      new Map(), models, { instruction: null, proposalCount: 3 },
    );
    // A job returns at most 3 proposals (lab-challenge-proposals@1), so each lesson's set is two jobs of three.
    for (let start = 0; start < lesson.output.length; start += 3) {
      const batch = lesson.output.slice(start, start + 3);
      const provider = new FakeAiProvider("ok", {}, null, () => ({ proposals: batch }));
      const reply = await provider.generate({
        system: DRAFT_LAB_CHALLENGE_SYSTEM, user: buildLabChallengeUser(snapshot), maxTokens: LAB_CHALLENGE_MAX_OUTPUT_TOKENS, timeoutMs: 60_000,
        responseSchema: LAB_CHALLENGE_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      const output = processLabChallengeOutput(snapshot, contexts, { labId: null, challengeParams: null }, reply.text);
      generated += batch.length;
      for (const drop of output.dropped) for (const code of drop.reasonCodes) droppedByReason[code] = (droppedByReason[code] ?? 0) + 1;
      if (!output.ok) {
        // All three dropped is a legitimate OUTPUT_VALIDATION_FAILED; anything else is a harness fault.
        if (output.code !== "OUTPUT_VALIDATION_FAILED") failures.push(`${lesson.id}: ${output.code}`);
        continue;
      }
      for (const item of output.items) {
        kept++;
        const { labId, challengeParams } = item.payload;
        const inRange = challengeParamErrors(labId, challengeParams).length === 0;
        const states = contexts.get(labId)!.referenceStates;
        const verdicts = states.map((state) => evaluate(labId, state.state, challengeParams, CHALLENGE_PARAMETERS[labId].modelRef).verdict);
        const verified = verdicts.some((v) => v === "passed") && verdicts.some((v) => v !== "passed") && JSON.stringify(verdicts) === JSON.stringify(item.flags.engineResults.map((r) => r.verdict));
        if (!inRange) failures.push(`${lesson.id}: kept proposal out of range ${JSON.stringify(item.payload)}`);
        if (!verified) failures.push(`${lesson.id}: kept proposal not engine verified ${JSON.stringify(item.payload)}`);
        rows.push({ lesson: lesson.id, labId, params: challengeParams, inRange, engineVerified: verified, passed: verdicts.filter((v) => v === "passed").length, states: verdicts.length, sensible: null, appropriate: null });
      }
    }
  }

  const report = {
    promptVersion: LAB_CHALLENGE_PROMPT_VERSION, provider: "fake (deterministic)", generated, kept, dropped: generated - kept, droppedByReason,
    keptInRange: rows.filter((r) => r.inRange).length, keptEngineVerified: rows.filter((r) => r.engineVerified).length,
    labelled: 0, sensibleAndAppropriateRate: null as number | null, failures, rows,
  };
  const out = process.argv.includes("--json") ? JSON.stringify(report, null, 2) : render(report);
  const outIndex = process.argv.indexOf("--out");
  if (outIndex >= 0 && process.argv[outIndex + 1]) writeFileSync(process.argv[outIndex + 1], out + "\n", "utf8");
  else console.log(out);
  if (failures.length) process.exit(1);
}

function render(r: ReturnType<typeof Object>) {
  const x = r as any;
  const lines = [
    "# TAI-06 golden evaluation (SYNTHETIC, fake provider)",
    "",
    "**Status: synthetic harness proof, NOT the lecturer evaluation.** Proposals were produced by the deterministic fake provider from a fixed set and checked by the same pipeline the job runner uses. No live provider was called (gate G-6 is open for real providers; the team-lead decision of 2026-11-09 limits tests and golden cases to the fake provider). No supervising lecturer labelled anything, so the ticket's 70% sensible-and-appropriate gate is **not assessed**.",
    "",
    `- Prompt: \`${x.promptVersion}\`; provider: ${x.provider}; bounds: team-lead default bounds 2026-11-09, pending PO/reviewer confirmation.`,
    `- Proposals generated: ${x.generated}; kept: ${x.kept}; dropped: ${x.dropped}.`,
    `- Kept proposals inside the validated ranges: ${x.keptInRange}/${x.kept}. Kept proposals engine-verified (at least one reference state passes, at least one does not, results equal a direct evaluate() call): ${x.keptEngineVerified}/${x.kept}.`,
    `- Dropped by reason: ${Object.entries(x.droppedByReason).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`,
    `- Lecturer labels: ${x.labelled} of ${x.kept} (sensible and appropriate rate: not assessed).`,
    "",
    "| Lesson | Lab | Parameters | In range | Engine verified | Reference states passed | Sensible | Appropriate |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...x.rows.map((row: any) => `| ${row.lesson} | ${row.labId} | \`${JSON.stringify(row.params)}\` | ${row.inRange ? "yes" : "NO"} | ${row.engineVerified ? "yes" : "NO"} | ${row.passed}/${row.states} | not labelled | not labelled |`),
    "",
    x.failures.length ? `FAILURES: ${x.failures.join("; ")}` : "Checks: every kept proposal is in range and engine-verified.",
  ];
  return lines.join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
