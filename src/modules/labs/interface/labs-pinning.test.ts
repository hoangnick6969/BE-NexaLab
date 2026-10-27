import { afterEach, describe, expect, it, vi } from "vitest";
import { MODEL_REGISTRY } from "../application/sim-packs";
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
    simulate: () => ({ version: "fixture-2.0.0", verdict: "passed" }),
  };
  const activePack = { id: "pack-v2", modelRef: nextModelRef };
  const db: any = {
    challenge: { findUnique: vi.fn().mockResolvedValue({
      id: "challenge-1", labId: "circuit", constraints: {},
      lab: { status: "published", scope: "SHARED_LIBRARY", releaseCleared: true,
        synthetic: false, topicCode: "topic-1", simulationModelRef: "circuit@1.0.0" },
    }) },
    assignment: { findFirst: vi.fn().mockResolvedValue(null) },
    simulationConfigVersion: { findFirst: vi.fn().mockResolvedValue({
      id: "config-v1", modelRef: "circuit@1.0.0",
      challengeParams: { "challenge-1": { maxCurrentMa: 5, minLitLeds: 1 } },
    }) },
    // Prisma's select returns only the ID; the controller never reads pack.modelRef.
    simulationPackVersion: { findFirst: vi.fn().mockResolvedValue({ id: activePack.id }) },
    attempt: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: "attempt-1", ...data })),
      count: vi.fn().mockResolvedValue(1),
    },
  };
  db.$transaction = vi.fn((run: (tx: any) => unknown) => run(db));
  const controller = new LabsController(db, { retryGuidance: vi.fn().mockReturnValue(null) } as any, { rate: vi.fn() } as any);
  const response = await controller.attempt(
    { user: { sub: "student-1" } },
    { challengeId: "challenge-1", labState: state, durationMs: 1000 },
  );
  return { activePack, db, response };
}

afterEach(() => { delete MODEL_REGISTRY[nextModelRef]; });

describe("attempt pack version pinning", () => {
  it("characterizes that an active pack ID can be recorded with the current Lab model result", async () => {
    const { activePack, db, response } = await submitWithDifferentActivePack();
    expect(db.simulationPackVersion.findFirst).toHaveBeenCalledWith({
      where: { labId: "circuit", status: "active" }, select: { id: true },
    });
    expect(response.packVersionId).toBe(activePack.id);
    expect(response.configVersionId).toBe("config-v1");
    expect(response.simulationResult.version).toBe("1.0.0");
    expect(response.verdict).toBe("partial");
    expect(MODEL_REGISTRY[activePack.modelRef].simulate(state).version).toBe("fixture-2.0.0");
  });

  // Expected failure until attempts evaluate the exact model pinned by the recorded pack.
  it.fails("evaluates the model pinned by the active pack", async () => {
    const { response } = await submitWithDifferentActivePack();
    expect(response.simulationResult.version).toBe("fixture-2.0.0");
  });
});
