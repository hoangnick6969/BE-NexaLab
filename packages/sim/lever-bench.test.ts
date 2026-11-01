import { describe, expect, it } from "vitest";
import { classifyLeverCase, evaluateLeverBench, evaluateLeverBenchWithRegistry, leverRegistry, validateLeverFixture } from "./lever-bench";
const id = "lever-bench-reference-v1";
const w = (positionMillimetres: number, forceMilliNewtons: number) => ({ kind: "WEIGHT", positionMillimetres, forceMilliNewtons });
const g = (positionMillimetres: number, forceMilliNewtons: number) => ({ kind: "GAUGE", positionMillimetres, forceMilliNewtons });
const run = (attachments: any[] = [], fixtureId = id) => evaluateLeverBench({ fixtureId, attachments });
const value = (result: any) => { expect(result.ok).toBe(true); return result.value; };
const err = (result: any, code: string) => expect(result).toEqual({ ok: false, code });
describe("lever-bench model slice", () => {
  it("M-01: signed moments, balance, O, accumulation", () => {
    expect(value(run([w(-100,1000),w(200,500)])).netMomentMilliNewtonMillimetres).toBe(0);
    expect(value(run([w(-100,1000),w(100,500)])).displayState).toBe("TILT_LEFT");
    expect(value(run([w(-100,500),w(200,1000)])).netMomentMilliNewtonMillimetres).toBe(-150000);
    expect(value(run([w(0,5000)])).attachments[0].armMillimetres).toBe(0);
    expect(value(run([g(0,100)])).attachments[0].signedMomentMilliNewtonMillimetres).toBe(0);
    expect(value(run()).balance).toBe("BALANCED");
    const sameSide = value(run([w(-100,1000),w(-200,500)]));
    expect([sameSide.ccwMomentMilliNewtonMillimetres,sameSide.cwMomentMilliNewtonMillimetres]).toEqual([200000,0]);
    expect(value(run([w(150,2000),g(-100,3000)])).balance).toBe("BALANCED");
  });
  it("M-02: exact integer units and safe bounds", () => {
    expect(100 * 10).toBe(1000); expect(1000 * 1000).toBe(1000000);
    const out = value(run([w(-250,5000),w(250,5000)]));
    expect(out.ccwMomentMilliNewtonMillimetres).toBe(1250000);
    expect(Number.isSafeInteger(out.netMomentMilliNewtonMillimetres)).toBe(true);
  });
  it("M-03: validates frozen presets and malformed copies", () => {
    const fixture = (leverRegistry as any)[id];
    expect(validateLeverFixture(fixture).ok).toBe(true);
    for (const change of [(f:any)=>f.gravityMetresPerSecondSquared=9,(f:any)=>f.holes[0]=-200,(f:any)=>f.provenance="source",(f:any)=>f.presets[0].gaugePositionMillimetres=150,(f:any)=>f.presets[1].loadForceMilliNewtons=2500,(f:any)=>f.presets[2].gaugePositionMillimetres=-50,(f:any)=>f.assumptions=["invented"]]) {
      const copy = structuredClone(fixture); change(copy);
      err(validateLeverFixture(copy), "INVALID_FIXTURE");
      err(evaluateLeverBenchWithRegistry({fixtureId:id,attachments:[]},{[id]:copy}),"INVALID_FIXTURE");
    }
  });
  it("M-04: schema, bounds, occupancy and 11-hole permutation", () => {
    for (const a of [w(251,500),w(25,500),w(2**53,500),w(50,550),w(50,5500),g(50,50),g(50,5100)]) err(run([a]),"OUT_OF_RANGE");
    for (const a of [{...w(50,500),extra:1},w(50,NaN),w(50,1.5),w(50,"500" as any)]) err(run([a]),"INVALID_SCHEMA");
    err(run([w(50,500),w(50,1000)]),"INVALID_CONFIGURATION");
    err(run([g(-50,100),g(50,100)]),"INVALID_CONFIGURATION");
    err(run([],"unknown"),"UNKNOWN_FIXTURE");
    const full = [-250,-200,-150,-100,-50,0,50,100,150,200,250].map((n,i)=>i===5?g(n,100):w(n,500));
    const a=value(run(full)), b=value(run([...full].reverse()));
    for (const key of ["ccwMomentMilliNewtonMillimetres","cwMomentMilliNewtonMillimetres","netMomentMilliNewtonMillimetres","balance","displayState"]) expect(a[key]).toEqual(b[key]);
    err(run([...full,w(0,500)]),"OUT_OF_RANGE");
  });
  it("M-05: deterministic, frozen input and isolated output", () => {
    const input = Object.freeze({fixtureId:id,attachments:Object.freeze([Object.freeze(w(-100,1000))])});
    const a=value(evaluateLeverBench(input));
    expect(a).toEqual(value(evaluateLeverBench(input)));
    a.attachments[0].forceMilliNewtons=5000;
    expect(value(evaluateLeverBench(input)).attachments[0].forceMilliNewtons).toBe(1000);
    expect(Object.isFrozen((leverRegistry as any)[id].presets[0])).toBe(true);
  });
  it("M-06: error precedence", () => {
    err(run([w(50,"500" as any)],"unknown"),"INVALID_SCHEMA");
    err(run([w(50,5500)],"unknown"),"OUT_OF_RANGE");
    err(run([],"unknown"),"UNKNOWN_FIXTURE");
    const bad=structuredClone((leverRegistry as any)[id]); bad.provenance="bad";
    err(evaluateLeverBenchWithRegistry({fixtureId:id,attachments:[w(50,500),w(50,500)]},{[id]:bad}),"INVALID_FIXTURE");
    err(run([w(50,500),w(50,500)]),"INVALID_CONFIGURATION");
  });
  it("M-07: classifier geometry, advantage and invalid input", () => {
    expect(value(classifyLeverCase({fulcrumMillimetres:0,loadMillimetres:-50,effortMillimetres:150}))).toMatchObject({geometry:"FULCRUM_BETWEEN",forceAdvantage:"GAIN",changesForceDirection:true});
    expect(value(classifyLeverCase({fulcrumMillimetres:-250,loadMillimetres:-100,effortMillimetres:250})).geometry).toBe("LOAD_BETWEEN");
    expect(value(classifyLeverCase({fulcrumMillimetres:-250,loadMillimetres:250,effortMillimetres:-200})).geometry).toBe("EFFORT_BETWEEN");
    expect(value(classifyLeverCase({fulcrumMillimetres:0,loadMillimetres:-100,effortMillimetres:100})).forceAdvantage).toBe("EQUAL");
    expect(value(classifyLeverCase({fulcrumMillimetres:0,loadMillimetres:50,effortMillimetres:-150}))).toMatchObject({geometry:"FULCRUM_BETWEEN",forceAdvantage:"GAIN",changesForceDirection:true});
    err(classifyLeverCase({fulcrumMillimetres:0,loadMillimetres:0,effortMillimetres:50}),"INVALID_CONFIGURATION");
    err(classifyLeverCase({fulcrumMillimetres:25,loadMillimetres:0,effortMillimetres:50}),"OUT_OF_RANGE");
  });
  it("M-08: only intended public entrypoint names", async () => {
    const publicModule = await import("./index");
    expect(publicModule.evaluateLeverBench).toBe(evaluateLeverBench);
    expect(publicModule.classifyLeverCase).toBe(classifyLeverCase);
    expect("validateLeverFixture" in publicModule).toBe(false);
    expect("leverRegistry" in publicModule).toBe(false);
  });
});
