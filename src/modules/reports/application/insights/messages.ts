/** Fixed neutral Vietnamese templates, one per rule (and one for the pattern). No dynamic text, no raw rule codes. */
export const INSIGHT_MESSAGES = {
  INSUFFICIENT_EVIDENCE: "Chưa đủ bài có điểm để so sánh kết quả của học sinh này.",
  SCORE_CHANGE_UNUSUAL: "Kết quả gần nhất khác đáng kể so với các lần trước",
  /** SCORE_CHANGE_UNUSUAL when every compared result is a resubmission of one assigned test within a short window. */
  SCORE_CHANGE_RETAKE: "Điểm thay đổi lớn giữa các lần làm lại cùng một bài; nên xem học sinh đã nắm vững kiến thức hay chỉ nhớ đáp án đề cũ.",
  HIGH_HINT_DEPENDENCE: "Nhiều lần thực hành cần gợi ý ở mức cao.",
  SUDDEN_UNAIDED_PASS: "Lần thực hành gần nhất đạt mà không cần gợi ý, sau nhiều lần cần gợi ý ở mức cao; nên xem lại các lần làm.",
  OBJECTIVE_MASTERY_INCONSISTENT: "Kết quả ở các loại bài khác nhau cho cùng một mục tiêu chưa thống nhất; nên xem lại các bài liên quan.",
  SUBMISSION_SIMILARITY_HIGH: "Bài làm có nội dung trùng khá nhiều với bài của học sinh khác trong cùng bài giao. Đây là bằng chứng để giáo viên đối chiếu, không phải kết luận.",
  MCQ_EXPLANATION_MISMATCH: "Điểm trắc nghiệm và phần giải thích bằng văn bản của cùng một bài học chưa tương xứng với nhau. Đây là bằng chứng để giáo viên đối chiếu, không phải kết luận.",
  SIMULATION_EXPLANATION_MISMATCH: "Kết quả thực hành và phần giải thích bằng văn bản của cùng một bài học chưa tương xứng với nhau. Đây là bằng chứng để giáo viên đối chiếu, không phải kết luận.",
  /** insights@4: one representative score per assignment, compared across different assignments over time. */
  ASSESSMENT_TREND: "Kết quả bài kiểm tra gần nhất khác đáng kể so với các bài kiểm tra trước (mỗi bài một điểm đại diện, không tính các lần làm lại). Nên xem lại các bài liên quan.",
  READINESS_BEFORE_MIDTERM: "Sắp đến bài kiểm tra giữa kỳ nhưng học sinh chưa hoàn thành bài ôn tập hoặc điểm luyện tập còn thấp. Nên nhắc học sinh ôn lại trước khi kiểm tra.",
} as const;

/** Words templates and codes must never contain (Vietnamese and English equivalents). */
export const FORBIDDEN_INSIGHT_WORDS = [
  "gian lận", "năng lực thật", "yếu kém", "xếp hạng", "nghi ngờ",
  "cheat", "true ability", "real ability", "weak", "poor", "ranking", "rank", "suspect", "suspicio",
];
