import { afterEach, describe, expect, it, vi } from "vitest";
import { MODEL_REGISTRY } from "../application/sim-packs";
import { AdminLabsController } from "./admin-labs.controller";
import { LabsController } from "./labs.controller";

vi.mock("../../progress/application/progress-projection", () => ({
  projectLab: vi.fn(),
  projectLesson: vi.fn(),
}));

const nextModelRef = "circuit@fixture-2.0.0";
const state = {
  nodes: [
    { id: "b", type: "battery", value: 9 },
    { id: "r", type: "resistor", value: 470 },
    { id: "l", type: "led" },
  ],
  edges: [
    { source: "b", target: "r" },
    { source: "r", target: "l" },
    { source: "l", target: "b" },
  ],
};

async function submitWithDifferentActivePack() {
  MODEL_REGISTRY[nextModelRef] = {
    ...MODEL_REGISTRY["circuit@1.0.0"],
    engineVersion: "fixture-2.0.0",
    simulate: () => ({ version: "fixture-2.0.0", verdict: "passed" }),
  };
  const activePack = {
    id: "pack-v2", labId: "circuit", modelRef: nextModelRef, engineVersion: "fixture-2.0.0",
    template: { ranges: { maxCurrentMa: { min: 5, max: 20 }, minLitLeds: { min: 1, max: 3 } } },
  };
  const db: any = {
    challenge: { findUnique: vi.fn().mockResolvedValue({
      id: "challenge-1", labId: "circuit", constraints: {},
      lab: { status: "published", scope: "SHARED_LIBRARY", releaseCleared: true,
        synthetic: false, topicCode: "topic-1", simulationModelRef: "circuit@1.0.0" },
    }) },
    assignment: { findFirst: vi.fn().mockResolvedValue(null) },
    simulationConfigVersion: { findFirst: vi.fn().mockResolvedValue({
      id: "config-v2", labId: "circuit", modelRef: nextModelRef,
      challengeParams: { "challenge-1": { maxCurrentMa: 5, minLitLeds: 1 } },
    }) },
    simulationPackVersion: { findFirst: vi.fn().mockResolvedValue(activePack) },
    labPackRevocation: { findUnique: vi.fn().mockResolvedValue(null) },
    attempt: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: "attempt-1", ...data })),
      count: vi.fn().mockResolvedValue(1),
    },
  };
  db.$transaction = vi.fn((run: (tx: any) => unknown) => run(db));
  db.$executeRaw = vi.fn();
  const controller = new LabsController(db, { retryGuidance: vi.fn().mockReturnValue(null) } as any, { rate: vi.fn() } as any);
  const response = await controller.attempt(
    { user: { sub: "student-1" } },
    { challengeId: "challenge-1", labState: state, durationMs: 1000 },
  );
  return { activePack, db, response };
}

afterEach(() => { delete MODEL_REGISTRY[nextModelRef]; });

describe("attempt pack version pinning", () => {
  it("records and uses a compatible pack, model and configuration", async () => {
    const { activePack, db, response } = await submitWithDifferentActivePack();
    expect(db.simulationPackVersion.findFirst).toHaveBeenCalledWith({
      where: { labId: "circuit", status: "active" },
    });
    expect(response.packVersionId).toBe(activePack.id);
    expect(response.configVersionId).toBe("config-v2");
    expect(response.simulationResult.version).toBe("fixture-2.0.0");
    expect(response.verdict).toBe("partial");
    expect(MODEL_REGISTRY[activePack.modelRef].simulate(state).version).toBe("fixture-2.0.0");
  });

  it("evaluates the model pinned by the active pack", async () => {
    const { response } = await submitWithDifferentActivePack();
    expect(response.simulationResult.version).toBe("fixture-2.0.0");
  });

  it("reproduces the recorded model and parameters without using current configuration", async () => {
    MODEL_REGISTRY[nextModelRef] = {
      ...MODEL_REGISTRY["circuit@1.0.0"], engineVersion: "fixture-2.0.0",
      simulate: () => ({ version: "fixture-2.0.0", verdict: "passed" }),
    };
    const params = { maxCurrentMa: 5, minLitLeds: 1 };
    const db: any = {
      attempt: { findUnique: vi.fn().mockResolvedValue({
        id: "attempt-1", challengeId: "challenge-1", configVersionId: "config-v2", packVersionId: "pack-v2",
        simulationModelVersion: "fixture-2.0.0", labState: state, verdict: "partial",
        challenge: { id: "challenge-1", labId: "circuit", constraints: { params: { maxCurrentMa: 20 } } },
        simulationResult: {
          version: "fixture-2.0.0", verdict: "partial", challengeCheck: { params, unmet: ["minLitLeds"] },
          _execution: { modelRef: nextModelRef, packVersionId: "pack-v2", configVersionId: "config-v2", params },
        },
      }) },
      simulationConfigVersion: { findUnique: vi.fn().mockResolvedValue({ id: "config-v2", labId: "circuit", modelRef: nextModelRef, challengeParams: { "challenge-1": { maxCurrentMa: 20 } } }) },
      simulationPackVersion: { findUnique: vi.fn().mockResolvedValue({ id: "pack-v2", labId: "circuit", modelRef: nextModelRef, engineVersion: "fixture-2.0.0" }) },
    };
    await expect(new AdminLabsController(db).reproduce("attempt-1")).resolves.toMatchObject({
      modelRef: nextModelRef, matches: true, resultMatches: true, reproductionBasis: "pinned_execution",
    });
    const stored = await db.attempt.findUnique();
    stored.simulationResult.version = "unexpected-output";
    await expect(new AdminLabsController(db).reproduce("attempt-1")).resolves.toMatchObject({
      verdictMatches: true, resultMatches: false, matches: false,
    });
  });
});
