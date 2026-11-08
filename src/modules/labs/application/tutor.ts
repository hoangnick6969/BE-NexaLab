/** HintLog.contextSnapshot for a legacy Lab hint (UC-AI-01): the attempt, its challenge, engine output and history. */
export function buildContext(
  user: any,
  attempt: any,
  history: any[],
  level: number,
) {
  return {
    studentLevel: user.studentLevel,
    challenge: {
      name: attempt.challenge.objective,
      goal: attempt.challenge.constraints,
    },
    labState: attempt.labState,
    simulation: attempt.simulationResult,
    attempts: history.length,
    hintsUsed: history.flatMap((a) => a.hints.map((h: any) => h.level)),
    hintLevel: level,
    actionHistory: history
      .slice(-5)
      .map((a) => ({
        attemptId: a.id,
        state: a.labState,
        result: a.simulationResult,
      })),
  };
}
export function misconceptions(attempts: any[]) {
  const recent = attempts.slice(0, 3);
  if (recent.length < 3) return [];
  const rules = [
    {
      status: "LED_OVERLOAD",
      hypothesis: "Có thể chưa hiểu vai trò giới hạn dòng của điện trở",
    },
    {
      status: "OPEN_CIRCUIT",
      hypothesis: "Có thể chưa nhận ra điều kiện mạch kín",
    },
    {
      status: "LOW_CURRENT",
      hypothesis: "Có thể chưa hiểu quan hệ điện áp và dòng điện",
    },
  ];
  return rules
    .filter((r) => recent.every((a) => a.simulationResult.status === r.status))
    .map((r) => ({
      hypothesis: r.hypothesis,
      confidence: "medium",
      evidence: recent.map((a) => a.id),
    }));
}
