import { describe, expect, it, vi } from "vitest";
import { LabsController } from "./labs.controller";
import { digest, FL06_RUBRIC } from "../application/lab-run";

const execution = { modelRef: "lever-bench@1.0.0", engineVersion: "1.0.0", packVersionId: "pack", configVersionId: "config",
  activityVersionId: "activity", activityDigest: "digest", activityKey: "lever-investigation", activityVersion: 1, rubricRef: FL06_RUBRIC,
  params: null, stateSchemaVersion: 1, evidenceSchemaVersion: 1, template: {} };
describe("FL-06 server event API", () => {
  it("keeps FL-10 route behavior distinct and denies legacy FL-06 attempts", async () => {
    const db: any = { challenge: { findUnique: vi.fn().mockResolvedValue({ labId: "lever-equilibrium", lab: { status: "published", simulationModelRef: "lever-bench@1.0.0" } }) } };
    const controller = new LabsController(db, {} as any, { rate: vi.fn() } as any);
    await expect(controller.attempt({ user: { sub: "student" } }, { challengeId: "lever", labState: {}, durationMs: 0 }))
      .rejects.toMatchObject({ response: { code: "FL06_REQUIRES_LAB_RUN" } });
  });
  it("persists ordered events, blocks duplicates and hides observation until observed", async () => {
    const rows: Array<{ sequence: number; idempotencyKey: string; event: any }> = [];
    const db: any = {
      labRun: { findFirst: vi.fn().mockResolvedValue({ id: "run", studentId: "student", labId: "lever-equilibrium", assignmentId: null,
        revokedAt: null, expiresAt: null, execution, executionDigest: digest(execution) }) },
      lab: { findUnique: vi.fn().mockResolvedValue({ status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: "topic" }) },
      labPackRevocation: { findUnique: vi.fn().mockResolvedValue(null) },
      labRunEvent: { findMany: vi.fn(async () => [...rows]), create: vi.fn(async ({ data }: any) => { rows.push(data); return data; }) },
      $executeRawUnsafe: vi.fn(), $transaction: async (fn: any) => fn(db),
    };
    const controller = new LabsController(db, {} as any, { rate: vi.fn() } as any);
    const req = { user: { sub: "student" } };
    const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
    const post = (n: number, event: unknown) => controller.recordFl10Event(req,"run",{idempotencyKey:key(n),event});
    await expect(post(1,{ type:"OBSERVED_ROTATION", trials:[] })).rejects.toMatchObject({response:{code:"INVALID_EVENT"}});
    const prediction = { type:"PREDICTED_ROTATION",predictions:[
      {positionMillimetres:-100,prediction:"TILT_LEFT"},{positionMillimetres:0,prediction:"LEVEL"},{positionMillimetres:100,prediction:"TILT_RIGHT"},
    ] };
    expect((await post(1,prediction)).observation).toBeNull();
    expect((await post(1,prediction)).events).toHaveLength(1);
    await expect(post(1,{...prediction,predictions:[{positionMillimetres:-100,prediction:"LEVEL"},...prediction.predictions.slice(1)]})).rejects.toMatchObject({response:{code:"IDEMPOTENCY_KEY_REUSED"}});
    const observed = await post(2,{ type:"OBSERVED_ROTATION",trials:[
      {attachments:[{kind:"WEIGHT",positionMillimetres:-100,forceMilliNewtons:1000}],observedState:"TILT_LEFT"},
      {attachments:[{kind:"WEIGHT",positionMillimetres:0,forceMilliNewtons:1000}],observedState:"LEVEL"},
      {attachments:[{kind:"WEIGHT",positionMillimetres:100,forceMilliNewtons:1000}],observedState:"TILT_RIGHT"},
    ] });
    expect(observed.observation[0]).toMatchObject({ok:true,value:{netMomentMilliNewtonMillimetres:100000}});
    expect(observed.observation).toHaveLength(3);
    expect((await controller.fl10Events(req,"run")).events).toHaveLength(2);
    expect(rows.map(row=>row.sequence)).toEqual([1,2]);
  });
});
