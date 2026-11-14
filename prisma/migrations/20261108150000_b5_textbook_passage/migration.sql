-- B5 (expand-only): tutor conversations about a highlighted textbook passage.
ALTER TABLE "TutorConversation" DROP CONSTRAINT "TutorConversation_contextKind_check";
ALTER TABLE "TutorConversation" ADD CONSTRAINT "TutorConversation_contextKind_check" CHECK ("contextKind" IN ('LAB', 'LESSON', 'EBOOK'));
ALTER TABLE "TutorMessage" ADD COLUMN "passage" TEXT, ADD COLUMN "pageNumber" INTEGER;
