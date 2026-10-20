import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const assignmentQuerySchema = z.object({ assignmentId: z.string().min(1).optional() }).strict();

/** Parse optional assignment context from a student learning endpoint query. */
export function parseAssignmentIdQuery(query: unknown): string | undefined {
  const parsed = assignmentQuerySchema.safeParse(query);
  if (!parsed.success)
    throw new BadRequestException({ code: "INVALID_ASSIGNMENT_CONTEXT", message: "assignmentId không hợp lệ" });
  return parsed.data.assignmentId;
}
