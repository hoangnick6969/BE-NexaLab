import { Global, Module } from "@nestjs/common";
import { STUDENT_AI_PROVIDER } from "./application/student-llm";
import { createStudentAiProvider } from "./infrastructure/providers";

/**
 * Student AI LLM provider (AD-18). Global so labs and learning controllers can inject STUDENT_AI_PROVIDER without
 * reaching into this module's infrastructure. A fake adapter outside development/test fails the boot.
 */
@Global()
@Module({
  providers: [{ provide: STUDENT_AI_PROVIDER, useFactory: () => createStudentAiProvider(process.env) }],
  exports: [STUDENT_AI_PROVIDER],
})
export class StudentAiModule {}
