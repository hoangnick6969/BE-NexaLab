import { z } from "zod";

export const nonEmpty = z.string().trim().min(1).max(500);
const optionsSchema = z.array(nonEmpty).min(2).max(6);
export const cardSchema = z.object({ front: nonEmpty, back: nonEmpty }).strict();
const questionSchema = z.object({ prompt: nonEmpty, options: optionsSchema, explanation: z.string().trim().max(1000).optional() }).strict();
export const testQuestionSchema = questionSchema.extend({ correctOption: z.number().int().min(0).max(5) });
/** STUDY_QUIZ keeps an answer key so a student gets right/wrong feedback; optional for quizzes made without one. */
export const studyQuizQuestionSchema = questionSchema.extend({ correctOption: z.number().int().min(0).max(5).optional() });

