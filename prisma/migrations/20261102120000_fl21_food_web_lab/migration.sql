-- FL-21: register the food-web Lab and its challenge so it can go through the admin
-- release flow (activity, configuration, pack, release and OWNER_SIGNOFF are created
-- and validated through the admin API, not here). There is no admin API that creates
-- a Lab row. The Lab starts private and unreleased: publishing the reviewed release is
-- what makes it public. Subject `khtn` matches the KHTN 8 lesson it binds to. Idempotent.
INSERT INTO "Subject" ("id", "name") VALUES ('khtn', 'Khoa học tự nhiên') ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Lab" ("id", "subjectId", "title", "grade", "topic", "learningObjective", "status", "scope", "releaseCleared", "topicCode", "synthetic", "simulationModelRef")
VALUES (
  'food-web', 'khtn', 'Lưới thức ăn và cân bằng tự nhiên', 8, 'Hệ sinh thái',
  'Phân biệt sinh vật sản xuất, tiêu thụ, phân giải; dựng chuỗi thức ăn trong lưới thức ăn; tính năng lượng truyền qua các bậc dinh dưỡng; dự đoán ảnh hưởng khi một loài bị mất và nhận ra các nguyên nhân gây mất cân bằng tự nhiên.',
  'draft', 'CLASS_PRIVATE', false, 'KHTN8-L44', false, 'food-web@1.0.0'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Challenge" ("id", "labId", "objective", "constraints", "difficulty")
VALUES (
  'fw_001', 'food-web',
  'Xếp vai trò sinh vật, dựng một chuỗi thức ăn hợp lệ, tính năng lượng tới bậc dinh dưỡng cao, dự đoán ảnh hưởng khi mất một loài và chọn các nguyên nhân gây mất cân bằng tự nhiên.',
  '{}', 'basic'
)
ON CONFLICT ("id") DO NOTHING;
