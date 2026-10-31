-- FL-25: register the em-induction Lab and its challenge so it can go through the
-- admin release flow (activity, configuration, pack, release and OWNER_SIGNOFF are
-- created and validated through the admin API, not here). There is no admin API that
-- creates a Lab row. The Lab starts private and unreleased: publishing the reviewed
-- release is what makes it public. Idempotent.
INSERT INTO "Subject" ("id", "name") VALUES ('physics', 'Vật lý') ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Lab" ("id", "subjectId", "title", "grade", "topic", "learningObjective", "status", "scope", "releaseCleared", "topicCode", "synthetic", "simulationModelRef")
VALUES (
  'em-induction', 'physics', 'Cảm ứng điện từ', 9, 'Điện từ',
  'Thực hiện thí nghiệm để nêu được điều kiện xuất hiện dòng điện cảm ứng và nguyên tắc tạo ra dòng điện xoay chiều.',
  'draft', 'CLASS_PRIVATE', false, 'KHTN9-CH04-T01', false, 'em-induction@1.0.0'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Challenge" ("id", "labId", "objective", "constraints", "difficulty")
VALUES (
  'em_001', 'em-induction',
  'Dự đoán và quan sát khi nào trong cuộn dây kín xuất hiện dòng điện cảm ứng và chiều của nó; giải thích nguyên tắc tạo ra dòng điện xoay chiều.',
  '{}', 'basic'
)
ON CONFLICT ("id") DO NOTHING;
