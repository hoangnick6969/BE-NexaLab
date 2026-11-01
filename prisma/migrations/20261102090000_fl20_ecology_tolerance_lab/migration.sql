-- FL-20: register the ecology-tolerance Lab and its challenge so it can go through the
-- admin release flow (activity, configuration, pack, release and OWNER_SIGNOFF are
-- created and validated through the admin API, not here). There is no admin API that
-- creates a Lab row. The Lab starts private and unreleased: publishing the reviewed
-- release is what makes it public. Subject `khtn` matches the KHTN 8 lessons it binds
-- to (release binding requires the same subject). Idempotent.
INSERT INTO "Subject" ("id", "name") VALUES ('khtn', 'Khoa học tự nhiên') ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Lab" ("id", "subjectId", "title", "grade", "topic", "learningObjective", "status", "scope", "releaseCleared", "topicCode", "synthetic", "simulationModelRef")
VALUES (
  'ecology-tolerance', 'khtn', 'Nhân tố và giới hạn sinh thái', 8, 'Sinh vật và môi trường',
  'Thay đổi nhiệt độ nước để trình bày khái niệm giới hạn sinh thái của cá rô phi và vận dụng để chọn loài phù hợp; tính mật độ cá thể và phân loại tháp tuổi của quần thể.',
  'draft', 'CLASS_PRIVATE', false, 'KHTN8-L41', false, 'ecology-tolerance@1.0.0'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Challenge" ("id", "labId", "objective", "constraints", "difficulty")
VALUES (
  'eco_001', 'ecology-tolerance',
  'Dự đoán và quan sát cá rô phi trong và ngoài giới hạn sinh thái về nhiệt độ, đọc giới hạn, chọn loài cá phù hợp, tính mật độ quần thể và phân loại tháp tuổi.',
  '{}', 'basic'
)
ON CONFLICT ("id") DO NOTHING;
