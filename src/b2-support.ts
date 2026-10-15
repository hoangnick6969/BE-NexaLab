export type SupportEvidence = { id: string; at: Date; passed?: boolean; verdict?: string };

export function supportFlags(input: {
  now: Date;
  dueDate: Date | null;
  completed: boolean;
  assignmentCreatedAt: Date;
  progressAt: Date[];
  quizzes: SupportEvidence[];
  practicals: SupportEvidence[];
}) {
  const flags: Array<Record<string, unknown>> = [];
  if (input.dueDate && input.dueDate < input.now && !input.completed)
    flags.push({ code: "OVERDUE_INCOMPLETE", message: "Bài đã quá hạn và chưa hoàn thành", evidenceIds: [], thresholdAt: input.dueDate });
  const failed = input.quizzes.filter((row) => !row.passed);
  if (failed.length >= 2)
    flags.push({ code: "QUIZ_FAILED_TWICE", message: "Có ít nhất hai lần làm bài kiểm tra chưa đạt", evidenceIds: failed.map((row) => row.id), count: failed.length, threshold: 2 });
  const failedPracticals = input.practicals.filter((row) => row.verdict !== "passed");
  if (input.practicals.length >= 3 && !input.practicals.some((row) => row.verdict === "passed"))
    flags.push({ code: "PRACTICAL_NOT_PASSED", message: "Có ít nhất ba lần thực hành nhưng chưa đạt", evidenceIds: failedPracticals.map((row) => row.id), count: failedPracticals.length, threshold: 3 });
  const activity = [...input.progressAt, ...input.quizzes.map((row) => row.at), ...input.practicals.map((row) => row.at)]
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? input.assignmentCreatedAt;
  const inactiveAt = new Date(activity.getTime() + 7 * 24 * 3600_000);
  if (inactiveAt <= input.now)
    flags.push({ code: "NO_ACTIVITY_7_DAYS", message: "Không có hoạt động học tập đủ điều kiện trong 7 ngày", evidenceIds: [], lastActivityAt: activity, thresholdAt: inactiveAt });
  return flags;
}
