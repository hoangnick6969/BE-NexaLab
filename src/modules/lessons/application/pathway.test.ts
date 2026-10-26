import { describe, expect, it } from "vitest";
import { buildPathwaySteps, materializeLegacySteps, reconcileVideoProgress, reconcileCardProgress, stepProgressActionSchema, validateLessonSteps, materializeQuizQuestions, quizConfigSchema, sanitizeQuizConfig } from "./pathway";

describe("lesson pathway", () => {
  it("materializes legacy content in deterministic order", () => {
    const steps = materializeLegacySteps({
      content: "<p>Read</p>",
      materials: [{ type: "video", url: "https://example.test/video", title: "Watch" }],
      questions: [{ prompt: "Safe question", options: ["A", "B"], answer: 1 }],
      labId: "circuit",
    });
    expect(steps.map((step) => [step.type, step.position])).toEqual([
      ["READING", 10],
      ["VIDEO", 20],
      ["QUIZ", 40],
      ["LAB", 50],
    ]);
  });

  it("materializes authored basic exercises without creating a Quiz", () => {
    const steps = materializeLegacySteps({
      content: "Read",
      materials: [],
      questions: [],
      basicExercises: {
        id: "practice-series-current",
        passThreshold: 60,
        questions: [
          {
            id: "practice-question-1",
            prompt: "Current?",
            options: [
              { id: "same", text: "Same" },
              { id: "different", text: "Different" },
            ],
            correctOptionId: "same",
          },
        ],
      },
    });
    expect(steps.map((step) => [step.id, step.type, step.position, step.required])).toContainEqual(["practice-series-current", "BASIC_EXERCISE", 30, true]);
    expect(steps.some((step) => step.type === "QUIZ")).toBe(false);
  });

  it("materializes BASIC_EXERCISE with stable IDs without gating the next step", () => {
    const exercise = {
      id: "step-pilot",
      passThreshold: 50,
      questions: [
        {
          id: "question-pilot",
          prompt: "Q",
          options: [
            { id: "option-a", text: "A" },
            { id: "option-b", text: "B" },
          ],
          correctOptionId: "option-a",
        },
      ],
    };
    const steps = materializeLegacySteps({
      content: "Read",
      materials: [],
      questions: [],
      basicExercises: exercise,
    });
    expect(steps.find((step) => step.type === "BASIC_EXERCISE")).toMatchObject({
      position: 30,
      config: { passThreshold: 50, questions: exercise.questions },
    });
    const pathway = buildPathwaySteps(
      steps.map((step, index) => ({
        ...step,
        id: `step-${index}`,
        ...(step.type === "READING" || step.type === "VIDEO" ? { progress: [{ status: "COMPLETED" as const, progressValue: 100 }] } : {}),
      })),
    );
    expect(pathway.steps.find((step) => step.type === "BASIC_EXERCISE")?.state).toBe("IN_PROGRESS");
    expect(pathway.steps.find((step) => step.type === "BASIC_EXERCISE")?.resource).toEqual({
      passThreshold: 50,
      questions: [
        {
          id: "question-pilot",
          prompt: "Q",
          options: [
            { id: "option-a", text: "A" },
            { id: "option-b", text: "B" },
          ],
        },
      ],
    });
    expect(pathway.nextStepId).toBe("step-2");
    expect(pathway.steps.every((step) => step.state !== "LOCKED")).toBe(true);
  });

  it("rejects empty resources and duplicate positions", () => {
    expect(() => materializeLegacySteps({ content: " ", materials: [], questions: [] })).toThrow();
    expect(() =>
      validateLessonSteps([
        { type: "READING" as const, position: 1, config: { html: "A" } },
        { type: "READING" as const, position: 1, config: { html: "B" } },
      ]),
    ).toThrow("unique positive positions");
  });

  it("uses the lesson text as the approved video equivalent when no video exists", () => {
    const steps = materializeLegacySteps({
      content: "Equivalent",
      materials: [],
      questions: [],
    });
    expect(steps[1]).toMatchObject({
      type: "VIDEO",
      position: 20,
      config: { title: "Nội dung thay thế", equivalentText: "Equivalent" },
    });
  });

  it("normalizes historical null video URLs and exposes resume evidence", () => {
    const pathway = buildPathwaySteps([
      {
        id: "video",
        type: "VIDEO",
        position: 20,
        required: true,
        config: { url: null, title: "Equivalent", equivalentText: "Read this" },
        progress: [{ status: "IN_PROGRESS", progressValue: 40, lastPosition: 24 }],
      },
    ]);
    expect(pathway.steps[0]).toMatchObject({
      lastPosition: 24,
      progressValue: 40,
    });
    expect(pathway.steps[0].resource).toEqual({
      title: "Equivalent",
      equivalentText: "Read this",
    });
  });

  it("validates strict video timing and reconciles monotonic high-water evidence", () => {
    expect(() =>
      stepProgressActionSchema.parse({
        action: "heartbeat",
        positionSeconds: 11,
        durationSeconds: 10,
      }),
    ).toThrow();
    expect(() =>
      stepProgressActionSchema.parse({
        action: "ended",
        positionSeconds: Number.NaN,
        durationSeconds: 10,
      }),
    ).toThrow();

    const completedAt = new Date("2026-01-01T00:00:00.000Z");
    const result = reconcileVideoProgress(
      { title: "Watch", url: "https://example.test/video.mp4" },
      {
        status: "COMPLETED",
        progressValue: 92,
        lastPosition: 92,
        startedAt: completedAt,
        completedAt,
      },
      { action: "heartbeat", positionSeconds: 12, durationSeconds: 100 },
      new Date("2026-01-02T00:00:00.000Z"),
    );
    expect(result).toMatchObject({
      status: "COMPLETED",
      progressValue: 100,
      lastPosition: 92,
      startedAt: completedAt,
      completedAt,
    });
  });

  it("uses configured coverage threshold, requires full short-video coverage, and gates fallback", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const config = {
      title: "Watch",
      url: "https://example.test/video.mp4",
      equivalentText: "Read this",
    };
    expect(
      reconcileVideoProgress(
        config,
        undefined,
        {
          action: "heartbeat",
          positionSeconds: 89,
          durationSeconds: 100,
        },
        now,
      ).status,
    ).toBe("IN_PROGRESS");
    expect(
      reconcileVideoProgress(
        config,
        undefined,
        {
          action: "heartbeat",
          positionSeconds: 9,
          durationSeconds: 10,
        },
        now,
    ).status,
    ).toBe("IN_PROGRESS");
    expect(
      reconcileVideoProgress(
        config,
        undefined,
        {
          action: "ended",
          positionSeconds: 1,
          durationSeconds: 10,
        },
        now,
      ),
    ).toMatchObject({
      status: "IN_PROGRESS",
      progressValue: 10,
      lastPosition: 1,
    });
    expect(reconcileVideoProgress(config, undefined, { action: "complete-fallback" }, now)).toMatchObject({
      progressValue: 100,
      lastPosition: null,
    });
    expect(() => reconcileVideoProgress({ title: "Watch", url: "https://example.test/video.mp4" }, undefined, { action: "complete-fallback" }, now)).toThrow("VIDEO_EQUIVALENT_UNAVAILABLE");
    expect(() => reconcileVideoProgress({ ...config, videoId: "olm-video-1" }, undefined, {
      action: "heartbeat", positionSeconds: 95, durationSeconds: 100,
    }, now)).toThrow("VIDEO_SESSION_REQUIRED");
    expect(reconcileVideoProgress({ ...config, videoId: "olm-video-1" }, undefined, { action: "complete-fallback" }, now).status).toBe("COMPLETED");
  });

  it("returns only the first core step as actionable and hides locked resources", () => {
    const pathway = buildPathwaySteps([
      {
        id: "read",
        type: "READING",
        position: 10,
        required: true,
        config: { html: "Read" },
      },
      {
        id: "cards",
        type: "STUDY_CARDS",
        position: 30,
        required: true,
        config: { cards: [{ id: "1", front: "F", back: "B" }] },
      },
      {
        id: "quiz",
        type: "QUIZ",
        position: 40,
        required: true,
        config: {
          questions: materializeQuizQuestions([{ prompt: "Q", options: ["A", "B"], answer: 1 }]),
        },
      },
    ]);
    expect(pathway.nextStepId).toBe("read");
    expect(pathway.steps.map((step) => step.state)).toEqual(["IN_PROGRESS", "LOCKED", "LOCKED"]);
    expect(pathway.steps[1].resource).toBeNull();
    expect(JSON.stringify(pathway)).not.toContain("answer");
  });

  it("keeps required basic exercise as evidence without locking the following step", () => {
    const pathway = buildPathwaySteps([
      {
        id: "exercise",
        type: "BASIC_EXERCISE",
        position: 30,
        required: true,
        config: {
          passThreshold: 60,
          questions: [
            {
              id: "question-1",
              prompt: "Current?",
              options: [
                { id: "same", text: "Same" },
                { id: "different", text: "Different" },
              ],
              correctOptionId: "same",
            },
          ],
        },
      },
      {
        id: "lab",
        type: "LAB",
        position: 50,
        required: true,
        config: { labId: "circuit" },
      },
    ]);
    expect(pathway.steps.map((step) => step.state)).toEqual(["IN_PROGRESS", "IN_PROGRESS"]);
    expect(pathway.steps[0].resource).toEqual({
      passThreshold: 60,
      questions: [
        {
          id: "question-1",
          prompt: "Current?",
          options: [
            { id: "same", text: "Same" },
            { id: "different", text: "Different" },
          ],
        },
      ],
    });
    expect(JSON.stringify(pathway)).not.toContain("correctOptionId");
  });

  it("requires every published card and rejects forged indexes", () => {
    const config = {
      cards: [
        { id: "a", front: "A", back: "a" },
        { id: "b", front: "B", back: "b" },
      ],
    };
    const now = new Date("2026-01-01T00:00:00.000Z");
    const first = reconcileCardProgress(config, undefined, { action: "visit", cardIndex: 0 }, now);
    expect(first).toMatchObject({
      status: "IN_PROGRESS",
      progressValue: 50,
      visitedCardIds: ["a"],
    });
    expect(() => reconcileCardProgress(config, first, { action: "complete", cardIndex: 0 }, now)).toThrow("CARDS_INCOMPLETE");
    expect(reconcileCardProgress(config, first, { action: "complete", cardIndex: 1 }, now)).toMatchObject({
      status: "COMPLETED",
      progressValue: 100,
      visitedCardIds: ["a", "b"],
    });
    expect(() => reconcileCardProgress(config, undefined, { action: "visit", cardIndex: 4 }, now)).toThrow("CARD_INDEX_INVALID");
  });

  it("advances from completed evidence and rejects invalid high-water values", () => {
    const pathway = buildPathwaySteps([
      {
        id: "read",
        type: "READING",
        position: 10,
        required: true,
        config: { html: "Read" },
        progress: [{ status: "COMPLETED", progressValue: 100 }],
      },
      {
        id: "cards",
        type: "STUDY_CARDS",
        position: 30,
        required: true,
        config: { cards: [{ id: "1", front: "F", back: "B" }] },
      },
    ]);
    expect(pathway.steps.map((step) => step.state)).toEqual(["COMPLETED", "IN_PROGRESS"]);
    expect(pathway.nextStepId).toBe("cards");
    expect(() =>
      buildPathwaySteps([
        {
          id: "read",
          type: "READING",
          position: 10,
          required: true,
          config: { html: "Read" },
          progress: [{ status: "IN_PROGRESS", progressValue: 101 }],
        },
      ]),
    ).toThrow("between 0 and 100");
    expect(() =>
      buildPathwaySteps([
        {
          id: "video",
          type: "VIDEO",
          position: 20,
          required: true,
          config: { title: "Watch", url: "https://example.test/video.mp4" },
          progress: [{ status: "IN_PROGRESS", progressValue: 10, lastPosition: -1 }],
        },
      ]),
    ).toThrow("valid integer second");
  });

  it("materializes stable question and option IDs and never delivers answer keys", () => {
    const legacy = [{ prompt: "Which way?", options: ["Left", "Right"], answer: 1 }];
    const [question] = materializeQuizQuestions(legacy);
    const quizStep = materializeLegacySteps({
      content: "Read",
      materials: [],
      questions: legacy,
    }).find((step) => step.type === "QUIZ");
    expect(quizStep?.config).toMatchObject({ passThreshold: 50 });
    expect(quizConfigSchema.parse({ questions: [question] }).passThreshold).toBe(50);
    expect(() => quizConfigSchema.parse({ questions: [question], passThreshold: 70 })).toThrow();
    expect(materializeQuizQuestions(legacy)[0]).toEqual(question);
    expect(question.id).not.toMatch(/^(0|1)$/);
    const delivered = sanitizeQuizConfig({ questions: [question] });
    expect(delivered.questions[0]).toEqual({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
    });
    expect(JSON.stringify(delivered)).not.toMatch(/answerOptionId|"answer"/i);
    expect(() => materializeQuizQuestions([{ prompt: "Invalid", options: ["Only one"], answer: 0 }])).toThrow();
    expect(() => materializeQuizQuestions([])).toThrow();
  });

  it("exposes the Quiz only after prerequisites and unlocks LAB only from passed quiz evidence", () => {
    const questions = materializeQuizQuestions([{ prompt: "Q", options: ["A", "B"], answer: 1 }]);
    const steps = [
      {
        id: "read",
        type: "READING" as const,
        position: 10,
        required: true,
        config: { html: "Read" },
        progress: [{ status: "COMPLETED" as const, progressValue: 100 }],
      },
      {
        id: "video",
        type: "VIDEO" as const,
        position: 20,
        required: true,
        config: { title: "Text", equivalentText: "Read" },
        progress: [{ status: "COMPLETED" as const, progressValue: 100 }],
      },
      {
        id: "quiz",
        type: "QUIZ" as const,
        position: 40,
        required: true,
        config: { questions },
      },
      {
        id: "lab",
        type: "LAB" as const,
        position: 50,
        required: true,
        config: { labId: "circuit" },
      },
    ];
    const ready = buildPathwaySteps(steps);
    expect(ready.steps.map((step) => step.state)).toEqual(["COMPLETED", "COMPLETED", "IN_PROGRESS", "LOCKED"]);
    expect(JSON.stringify(ready.steps[2].resource)).not.toContain("answerOptionId");
    const passed = buildPathwaySteps(
      steps.map((step) =>
        step.id === "quiz"
          ? {
              ...step,
              progress: [{ status: "COMPLETED" as const, progressValue: 100 }],
            }
          : step,
      ),
    );
    expect(passed.steps.map((step) => step.state)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED", "IN_PROGRESS"]);
  });

  it("unlocks CHALLENGE when LAB is completed, keeping it locked with PRACTICE_NOT_PASSED before that", () => {
    const questions = materializeQuizQuestions([{ prompt: "Q", options: ["A", "B"], answer: 1 }]);
    const steps = [
      {
        id: "read",
        type: "READING" as const,
        position: 10,
        required: true,
        config: { html: "Read" },
        progress: [{ status: "COMPLETED" as const, progressValue: 100 }],
      },
      {
        id: "video",
        type: "VIDEO" as const,
        position: 20,
        required: true,
        config: { title: "Text", equivalentText: "Read" },
        progress: [{ status: "COMPLETED" as const, progressValue: 100 }],
      },
      {
        id: "quiz",
        type: "QUIZ" as const,
        position: 40,
        required: true,
        config: { questions },
        progress: [{ status: "COMPLETED" as const, progressValue: 100 }],
      },
      {
        id: "lab",
        type: "LAB" as const,
        position: 50,
        required: true,
        config: { labId: "circuit" },
      },
      {
        id: "challenge",
        type: "CHALLENGE" as const,
        position: 60,
        required: true,
        config: { challengeId: "circuit_001" },
      },
    ];

    // LAB is IN_PROGRESS, CHALLENGE is LOCKED with PRACTICE_NOT_PASSED
    const initial = buildPathwaySteps(steps);
    expect(initial.steps[3].state).toBe("IN_PROGRESS");
    expect(initial.steps[4].state).toBe("LOCKED");
    expect(initial.steps[4].lockReasonCode).toBe("PRACTICE_NOT_PASSED");
    expect(initial.steps[4].resource).toBeNull();

    // Student completes LAB
    const labCompleted = buildPathwaySteps(
      steps.map((step) =>
        step.id === "lab"
          ? {
              ...step,
              progress: [{ status: "COMPLETED" as const, progressValue: 100 }],
            }
          : step,
      ),
    );
    expect(labCompleted.steps[3].state).toBe("COMPLETED");
    expect(labCompleted.steps[4].state).toBe("IN_PROGRESS");
    expect(labCompleted.steps[4].lockReasonCode).toBeNull();
    expect(labCompleted.steps[4].resource).toEqual({
      challengeId: "circuit_001",
    });
  });

  it("names the step that actually blocks a locked step", () => {
    const questions = materializeQuizQuestions([{ prompt: "Q", options: ["A", "B"], answer: 1 }]);
    const reading = {
      id: "read",
      type: "READING" as const,
      position: 10,
      required: true,
      config: { html: "Read" },
    };
    const quiz = {
      id: "quiz",
      type: "QUIZ" as const,
      position: 40,
      required: true,
      config: { questions },
    };
    const lab = {
      id: "lab",
      type: "LAB" as const,
      position: 50,
      required: true,
      config: { labId: "circuit" },
    };
    const challenge = {
      id: "challenge",
      type: "CHALLENGE" as const,
      position: 60,
      required: true,
      config: { challengeId: "circuit_001" },
    };
    const done = [{ status: "COMPLETED" as const, progressValue: 100 }];

    // No quiz in the lesson: the lab waits for reading, not for a quiz.
    expect(buildPathwaySteps([reading, lab, challenge]).steps.map((step) => step.lockReasonCode)).toEqual([null, "PREREQUISITE_INCOMPLETE", "PREREQUISITE_INCOMPLETE"]);
    // Reading done, quiz pending: both practical steps wait for the quiz.
    expect(buildPathwaySteps([{ ...reading, progress: done }, quiz, lab, challenge]).steps.map((step) => step.lockReasonCode)).toEqual([null, null, "QUIZ_NOT_PASSED", "QUIZ_NOT_PASSED"]);
  });
});
