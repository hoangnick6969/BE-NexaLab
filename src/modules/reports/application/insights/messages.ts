/** Fixed neutral Vietnamese templates, one per rule (and one for the pattern). No dynamic text, no raw rule codes. */
export const INSIGHT_MESSAGES = {
  INSUFFICIENT_EVIDENCE: "Chưa đủ bài có điểm để so sánh kết quả của học sinh này.",
  SCORE_CHANGE_UNUSUAL: "Kết quả gần nhất khác đáng kể so với các lần trước",
  HIGH_HINT_DEPENDENCE: "Nhiều lần thực hành cần gợi ý ở mức cao.",
  SUDDEN_UNAIDED_PASS: "Lần thực hành gần nhất đạt mà không cần gợi ý, sau nhiều lần cần gợi ý ở mức cao; nên xem lại các lần làm.",
  OBJECTIVE_MASTERY_INCONSISTENT: "Kết quả ở các loại bài khác nhau cho cùng một mục tiêu chưa thống nhất; nên xem lại các bài liên quan.",
} as const;

/** Words templates and codes must never contain (Vietnamese and English equivalents). */
export const FORBIDDEN_INSIGHT_WORDS = [
  "gian lận", "năng lực thật", "yếu kém", "xếp hạng", "nghi ngờ",
  "cheat", "true ability", "real ability", "weak", "poor", "ranking", "rank", "suspect", "suspicio",
];
