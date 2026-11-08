/** SAI-01 T4: OpenAPI components for the legacy Lab hint and tutor status (fixture docs/contracts/student-lab-hint-v1.json). */
export const labHintOpenApiSchemas = {
  StudentLabHint: {
    type: "object",
    required: ["id", "attemptId", "level", "content", "escalated", "provider", "createdAt"],
    properties: {
      id: { type: "string" },
      attemptId: { type: "string" },
      level: { type: "integer", minimum: 1, maximum: 4 },
      content: { type: "string" },
      escalated: { type: "boolean", nullable: true },
      provider: { type: "string", enum: ["rules", "rules-fallback", "anthropic", "fake", "cache"] },
      createdAt: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  TutorStatus: {
    type: "object",
    required: ["provider", "llmEnabled", "ruleVersion"],
    properties: {
      provider: { type: "string", enum: ["rules", "anthropic", "fake"] },
      llmEnabled: { type: "boolean" },
      ruleVersion: { type: "string" },
    },
    additionalProperties: false,
  },
};
