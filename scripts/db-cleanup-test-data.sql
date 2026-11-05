-- Dọn dữ liệu test/mock trên DB dev dùng chung (Supabase).
-- Mặc định kết thúc bằng ROLLBACK: chạy thử để xem số dòng, không xoá gì.
-- Khi đã duyệt, đổi dòng ROLLBACK cuối file thành COMMIT.
--
-- Giữ nguyên: tài khoản seed (*@nexalab.local, nguyenan.8a, student.*), lớp seed
-- (demo-class, class-pilot-a, class-pilot-b), toàn bộ Lesson/Lab/Release, AuditLog.
-- Nhận diện dữ liệu test: username bắt đầu bằng pw- / it-, email @example.test,
-- lớp/bài giao/tài nguyên có tên bắt đầu bằng pw- / it-.

BEGIN;

-- Owner duyệt 2026-11-05: xoá thêm reviewer pilot-test, anh123, lesson "gói minh họa" và lớp "8/9".
CREATE TEMP TABLE _tu ON COMMIT DROP AS
  SELECT id FROM "User" WHERE username ~ '^(pw-|it-)' OR email ~ '@example\.test$'
     OR email ~ '@pilot-test\.nexalab\.local$' OR username = 'anh123';
CREATE TEMP TABLE _tc ON COMMIT DROP AS
  SELECT id FROM "Classroom" WHERE "teacherId" IN (SELECT id FROM _tu) OR name ~ '^(pw-|it-)'
     OR (name = '8/9' AND id = 'cmv5azf86000rnm4o0et1l3u7');

-- 0. Lesson minh họa trong thư viện chung (cascade: step, locator; ClassResource.lessonId → NULL).
DELETE FROM "Lesson" WHERE id = 'pack-fixture-khtn8-dong-dien-noi-tiep-v1';

-- 1. Thông báo của tài khoản test và thông báo nhắc tới bài/tài nguyên test.
DELETE FROM "Notification"
 WHERE "recipientId" IN (SELECT id FROM _tu) OR title ~ '(pw-|it-1)' OR coalesce(body, '') ~ '(pw-|it-1)';

-- 2. Tài nguyên lớp do Playwright tạo trong lớp seed.
DELETE FROM "ClassResource" WHERE title ~ '^(pw-|it-)';

-- 3. Bài giao test (cascade: target, hạn, bài nộp, quyết định nộp trễ, StepProgress, gate override).
DELETE FROM "Assignment" WHERE title ~ '^(pw-|it-)' OR "classId" IN (SELECT id FROM _tc);

-- 4. Lớp test (cascade: enrollment, tài nguyên lớp).
DELETE FROM "Classroom" WHERE id IN (SELECT id FROM _tc);

-- 5. Lượt chạy Lab của tài khoản test (LabRun không có FK tới User).
DELETE FROM "LabRunEvent" WHERE "runId" IN (SELECT id FROM "LabRun" WHERE "studentId" IN (SELECT id FROM _tu));
DELETE FROM "Attempt" WHERE "labRunId" IN (SELECT id FROM "LabRun" WHERE "studentId" IN (SELECT id FROM _tu));
DELETE FROM "LabRun" WHERE "studentId" IN (SELECT id FROM _tu);

-- 6. Tài khoản test (cascade: session, enrollment, attempt, progress, quiz, liên kết phụ huynh...).
DELETE FROM "User" WHERE id IN (SELECT id FROM _tu);

-- 7. Dữ liệu tạm đã hết hạn.
DELETE FROM "Session" WHERE "expiresAt" < now();
DELETE FROM "IdempotencyRecord" WHERE "expiresAt" < now();
DELETE FROM "RateLimitBucket" WHERE "expiresAt" < now();

-- Kiểm tra sau khi xoá: các cột đều phải là 0.
SELECT
  (SELECT count(*) FROM "User" WHERE username ~ '^(pw-|it-)' OR email ~ '@example\.test$') AS test_users,
  (SELECT count(*) FROM "Classroom" WHERE name ~ '^(pw-|it-)') AS test_classes,
  (SELECT count(*) FROM "Assignment" WHERE title ~ '^(pw-|it-)') AS test_assignments,
  (SELECT count(*) FROM "ClassResource" WHERE title ~ '^(pw-|it-)') AS test_resources,
  (SELECT count(*) FROM "User" WHERE email ~ '@pilot-test\.nexalab\.local$' OR username = 'anh123') AS extra_users,
  (SELECT count(*) FROM "Lesson" WHERE id = 'pack-fixture-khtn8-dong-dien-noi-tiep-v1') AS fixture_lesson,
  (SELECT count(*) FROM "Classroom" WHERE id = 'cmv5azf86000rnm4o0et1l3u7') AS class_8_9;

ROLLBACK;
