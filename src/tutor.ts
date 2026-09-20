import { circuit } from "../packages/sim";
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
export function tutorHint(context: any): string {
  const level = context.hintLevel;
  const s = context.simulation;
  if (s.status) {
    const hints: Record<string, string[]> = {
      OPEN_CIRCUIT: [
        "Em có lần theo được một vòng dây kín từ nguồn rồi quay về nguồn không?",
        "Dòng điện cần một đường dẫn khép kín.",
        "Thử nối các đầu còn rời thành một vòng chứa nguồn, LED và điện trở.",
        "Mạch hở không có dòng điện. Hãy kiểm tra dây nối, sau đó chạy lại để engine xác nhận.",
      ],
      SWITCH_OPEN: [
        "Công tắc hiện đang ở trạng thái nào?",
        "Công tắc mở làm ngắt đường đi của dòng điện.",
        "Thử đóng công tắc rồi chạy lại.",
        "Mạch chỉ dẫn điện khi có đường khép kín và mọi công tắc trên nhánh đều đóng.",
      ],
      LED_OVERLOAD: [
        "Dòng điện engine trả về có vượt giới hạn 20 mA không?",
        "Khi giữ nguyên điện áp, tăng điện trở sẽ làm dòng điện giảm.",
        "Thử thêm hoặc tăng điện trở trên nhánh LED rồi chạy lại.",
        "Engine dùng I = (U − 2 V × số LED) / R. Với một LED, điện trở tối thiểu do engine tính là " +
          s.minimumResistance +
          " Ω. Nhánh không có điện trở được đánh dấu quá dòng, không gán dòng hữu hạn giả.",
      ],
      NO_LED: [
        "Trong vòng kín hiện có LED chưa?",
        "Chỉ linh kiện nằm trên đường dẫn kín mới tham gia thí nghiệm.",
        "Thử đưa LED vào cùng vòng dây với nguồn và điện trở.",
        "Mục tiêu yêu cầu LED sáng. Vòng kín chỉ có điện trở chưa đáp ứng mục tiêu.",
      ],
      LOW_CURRENT: [
        "Điện áp nguồn và số LED có phù hợp với nhau không?",
        "LED cần đủ điện áp thuận và dòng tối thiểu trong mô hình.",
        "Thử điều chỉnh điện áp hoặc giảm điện trở trong giới hạn an toàn.",
        "Mô hình dùng sụt áp 2 V mỗi LED và ngưỡng sáng 1 mA. Engine đánh giá các ngưỡng này trên từng nhánh.",
      ],
      SAFE: [
        "Điều gì thay đổi so với lần thử trước để LED sáng an toàn?",
        "Quan hệ giữa U, I và R giúp giải thích kết quả này.",
        "Thử dự đoán dòng điện khi tăng điện trở rồi kiểm tra.",
        "Em đã đạt mục tiêu: có LED sáng và không nhánh nào quá dòng. Hãy dùng số liệu của engine để trình bày kết luận.",
      ],
    };
    return (hints[s.status] ?? hints.OPEN_CIRCUIT)[level - 1];
  }
  if (s.equation)
    return [
      "Em quan sát thấy chất nào còn dư?",
      "Hệ số phương trình cho biết tỉ lệ số mol phản ứng.",
      "Thử thay đổi lượng chất để tỉ lệ mol khớp hệ số phương trình.",
      "Engine xác định mức tiến triển bằng min(nA/hệ số A, nB/hệ số B). Kết quả hiện tại: " +
        s.extent +
        " mol; chất giới hạn: " +
        s.limiting +
        ".",
    ][level - 1];
  return [
    "Bộ phận nào tiếp nhận ánh sáng trước tiên?",
    "Hãy liên hệ vị trí với chức năng của từng bộ phận.",
    "Mở chế độ khám phá và theo đường đi của ánh sáng, sau đó thử lại.",
    "Ánh sáng đi qua giác mạc, thủy dịch, đồng tử, thể thủy tinh và dịch kính để đến võng mạc.",
  ][level - 1];
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
