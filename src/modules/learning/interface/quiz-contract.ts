export const quizOpenApiSchemas = {
  ApiErrorEnvelope: {
    type: "object",
    required: ["statusCode", "code", "message"],
    properties: {
      statusCode: { type: "integer" },
      code: { type: "string" },
      message: { type: "string" },
      details: {},
    },
    additionalProperties: false,
  },
  StudentQuiz: {
    type: "object",
    required: ["lessonId", "stepId", "questions"],
    properties: {
      lessonId: { type: "string" },
      stepId: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "prompt", "options"],
          properties: {
            id: { type: "string" },
            prompt: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "text"],
                properties: { id: { type: "string" }, text: { type: "string" } },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  QuizAttemptRequest: {
    type: "object",
    required: ["answers", "idempotencyKey"],
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          required: ["questionId", "optionId"],
          properties: { questionId: { type: "string" }, optionId: { type: "string" } },
          additionalProperties: false,
        },
      },
      idempotencyKey: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  QuizAttemptSummary: {
    type: "object",
    required: ["id", "score", "passed", "correctCount", "questionCount", "createdAt", "results"],
    properties: {
      id: { type: "string" },
      score: { type: "number" },
      passed: { type: "boolean" },
      correctCount: { type: "integer" },
      questionCount: { type: "integer" },
      createdAt: { type: "string", format: "date-time" },
      results: {
        type: "array",
        items: {
          type: "object",
          required: ["questionId", "correct"],
          properties: { questionId: { type: "string" }, correct: { type: "boolean" } },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  QuizAttemptHistory: {
    type: "object",
    required: ["attempts"],
    properties: {
      attempts: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "idempotencyKey", "score", "passed", "correctCount", "questionCount", "createdAt", "latest", "best", "results"],
          properties: {
            id: { type: "string" },
            idempotencyKey: { type: "string", format: "uuid" },
            score: { type: "number" },
            passed: { type: "boolean" },
            correctCount: { type: "integer" },
            questionCount: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
            latest: { type: "boolean" },
            best: { type: "boolean" },
            results: {
              type: "array",
              items: {
                type: "object",
                required: ["questionId", "prompt", "selectedOptionText", "correct"],
                properties: {
                  questionId: { type: "string" },
                  prompt: { type: "string" },
                  selectedOptionText: { type: "string" },
                  correct: { type: "boolean" },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  StudentPathway: {
    type: "object",
    required: ["lesson", "assignment", "steps", "nextStepId", "updatedAt"],
    properties: {
      lesson: { type: "object", additionalProperties: true },
      assignment: { type: "object", additionalProperties: true },
      steps: { type: "array", items: { type: "object", additionalProperties: true } },
      nextStepId: { type: "string", nullable: true },
      updatedAt: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },
  QuizAttemptResponse: {
    type: "object",
    required: ["attempt", "pathway"],
    properties: {
      attempt: { $ref: "#/components/schemas/QuizAttemptSummary" },
      pathway: { $ref: "#/components/schemas/StudentPathway" },
    },
    additionalProperties: false,
  },
};
