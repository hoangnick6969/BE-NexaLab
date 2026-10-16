import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { coverageReport, digestOf, packGateErrors, packManifestSchema, type GateContext } from "./content-pack";
import { boundedFetch, preFetchProblems, robotsAllows, sourcePolicySchema, urlProblem } from "./ingestion";
import { inspectGlb, inspectVtt, mediaTypeFor, uploadsEnabled } from "./media";

const fixture = JSON.parse(readFileSync(new URL("../content/releases/fixture-khtn8-energy.json", import.meta.url), "utf8"));
const pack = () => packManifestSchema.parse(structuredClone(fixture.packs[0]));
const ctx = (overrides: Partial<GateContext> = {}): GateContext => ({
  namespace: "fixture",
  outcomes: new Map([["FX8-ENERGY-02", { grade: 8, domain: "ENERGY", status: "active", synthetic: true }]]),
  assetVersions: new Map(),
  reviewers: new Set(),
  labs: new Set(["circuit"]),
  ...overrides,
});

describe("content pack gates (CF-T1)", () => {
  it("the fixture pack passes every gate in the fixture namespace", () => {
    expect(packGateErrors(pack(), ctx())).toEqual([]);
  });
  it("a synthetic pack cannot enter the baseline namespace and baseline reviewers must be accounts", () => {
    const errors = packGateErrors(pack(), ctx({ namespace: "baseline" }));
    expect(errors).toContain("gói minh họa (synthetic) chỉ được nằm trong namespace fixture");
    expect(errors.some((e) => e.includes("không phải tài khoản giáo viên"))).toBe(true);
    expect(errors.some((e) => e.includes("là dữ liệu mẫu"))).toBe(true);
  });
  it("important claims need two independent sources including an authoritative one", () => {
    const m = pack();
    m.knowledgeUnits[0].claims[0].sourceIds = ["nexalab-bien-soan"];
    expect(packGateErrors(m, ctx())).toEqual([
      "khẳng định quan trọng claim-cuong-do-bang-nhau cần ít nhất hai nguồn độc lập",
      "khẳng định quan trọng claim-cuong-do-bang-nhau cần một nguồn có thẩm quyền",
    ]);
  });
  it("NC/ND/unknown licences, missing reviews and identical subject/rights reviewers block release", () => {
    const m = pack();
    m.sources[1].license = "CC_BY_NC";
    delete (m.reviews as any).accessibility;
    m.reviews.rights = { ...m.reviews.subject! };
    const errors = packGateErrors(m, ctx());
    expect(errors).toEqual(
      expect.arrayContaining([
        "nguồn giao-trinh-vat-ly-minh-hoa có giấy phép CC_BY_NC không được phép trong kho phát hành",
        "thiếu duyệt accessibility",
        "người duyệt chuyên môn và người duyệt bản quyền phải khác nhau",
      ]),
    );
  });
  it("answer keys must point at an option and video needs a transcript and a checked caption", () => {
    const m = pack();
    m.lesson.questions[0].answerId = "khong-co";
    m.lesson.materials = [{ type: "video", url: "assetv:aaaaaaaaaaaaaaaaaaaaaaaaa", title: "Video" }];
    const errors = packGateErrors(m, ctx());
    expect(errors).toContain("câu q-noi-tiep-1: đáp án không nằm trong lựa chọn");
    expect(errors).toContain('video "Video" thiếu bản chép lời');
    expect(errors).toContain('video "Video" thiếu phụ đề WebVTT đã kiểm tra');
    expect(errors).toContain('học liệu "Video" không trỏ tới phiên bản tệp sẵn sàng');
  });
  it("digests ignore key order and change with content", () => {
    expect(digestOf({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(digestOf({ b: [1, { d: 3, c: 2 }], a: 1 }));
    const m = pack();
    const before = digestOf(m);
    m.title += " v2";
    expect(digestOf(m)).not.toBe(before);
  });
  it("coverage keeps five dimensions apart and never counts synthetic packs as released", () => {
    const rows = coverageReport(
      [
        { code: "FX8-ENERGY-01", grade: 8, domain: "ENERGY", status: "active", synthetic: true },
        { code: "FX8-ENERGY-02", grade: 8, domain: "ENERGY", status: "active", synthetic: true },
      ],
      [{ manifest: pack(), synthetic: true }],
      new Set(["circuit"]),
    );
    const released = rows.find((r) => !r.synthetic && r.grade === 8 && r.domain === "ENERGY");
    const fixtureRow = rows.find((r) => r.synthetic && r.grade === 8 && r.domain === "ENERGY");
    expect(released.lessons_released).toEqual({ numerator: 0, denominator: 0, gaps: [] });
    expect(released.outcomes_mapped.denominator).toBeNull();
    expect(fixtureRow.lessons_released).toEqual({ numerator: 1, denominator: 2, gaps: ["FX8-ENERGY-01"] });
    expect(fixtureRow.simulations_available.numerator).toBe(1);
  });
});

describe("source policy and bounded ingestion (CF-T3)", () => {
  const policy = () => sourcePolicySchema.parse(structuredClone(fixture.sources[0].policy));
  it("pre-fetch gates: disabled, NC licence, overdue recheck, crawl mode", () => {
    expect(preFetchProblems(policy(), true, new Date("2026-10-16"))).toEqual([]);
    expect(preFetchProblems(policy(), false)).toContain("nguồn đang tắt");
    expect(preFetchProblems({ ...policy(), license: { code: "CC_BY_NC", attribution: "x" } }, true)).toContain(
      "giấy phép CC_BY_NC không được phép",
    );
    expect(preFetchProblems(policy(), true, new Date("2027-05-01"))).toContain("đã quá hạn rà soát lại điều khoản nguồn");
    expect(preFetchProblems({ ...policy(), accessMode: "BOUNDED_CRAWL" }, true, new Date("2026-10-16"))).toContain(
      "chế độ crawl có giới hạn chưa được bật trong MVP",
    );
  });
  it("host/path allowlist, HTTPS and private-network guard", () => {
    expect(urlProblem("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/962/property/Title/JSON", policy())).toBeNull();
    expect(urlProblem("https://evil.example/rest/pug/compound/cid/962", policy())).toMatch(/ngoài danh sách/);
    expect(urlProblem("https://pubchem.ncbi.nlm.nih.gov/other", policy())).toMatch(/ngoài phạm vi/);
    expect(urlProblem("http://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/1", policy())).toMatch(/HTTPS/);
    expect(urlProblem("https://127.0.0.1/rest/pug/compound/cid/1", { ...policy(), allowedHosts: ["127.0.0.1"] })).toMatch(/mạng nội bộ/);
  });
  it("robots.txt longest match wins", () => {
    const robots = "User-agent: *\nDisallow: /private\nAllow: /private/open\n";
    expect(robotsAllows(robots, "/private/x")).toBe(false);
    expect(robotsAllows(robots, "/private/open/x")).toBe(true);
    expect(robotsAllows(robots, "/public")).toBe(true);
  });
  it("re-checks redirects against the allowlist and caps size/MIME while streaming", async () => {
    const p = policy();
    const redirectAway = (async () =>
      new Response(null, { status: 302, headers: { location: "https://evil.example/rest/pug/compound/cid/1" } })) as any;
    await expect(boundedFetch("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/1/JSON", p, redirectAway)).rejects.toThrow(
      /ngoài danh sách/,
    );
    const huge = (async () => new Response("x".repeat(300000), { headers: { "content-type": "application/json" } })) as any;
    await expect(boundedFetch("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/1/JSON", p, huge)).rejects.toThrow(/kích thước/);
    const html = (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as any;
    await expect(boundedFetch("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/1/JSON", p, html)).rejects.toThrow(/text\/html/);
  });
});

describe("media validation (CF-T2)", () => {
  it("maps only allowlisted MIME + extension pairs", () => {
    expect(mediaTypeFor("a.pdf", "application/pdf")?.kind).toBe("pdf");
    expect(mediaTypeFor("a.exe", "application/pdf")).toBeNull();
    expect(mediaTypeFor("a.vtt", "text/vtt")?.kind).toBe("caption");
  });
  it("blocks uploads in pilot/production until budgets are approved", () => {
    expect(uploadsEnabled({ APP_ENV: "development" } as any).enabled).toBe(true);
    expect(uploadsEnabled({ APP_ENV: "pilot" } as any).enabled).toBe(false);
    expect(uploadsEnabled({ APP_ENV: "production", ASSET_BUDGETS_APPROVED: "true" } as any).enabled).toBe(true);
  });
  it("inspects GLB node inventory and rejects external URIs", () => {
    const glb = (json: object) => {
      const body = Buffer.from(JSON.stringify(json));
      const padded = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4, 0x20)]);
      const header = Buffer.alloc(20);
      header.write("glTF", 0);
      header.writeUInt32LE(2, 4);
      header.writeUInt32LE(20 + padded.length, 8);
      header.writeUInt32LE(padded.length, 12);
      header.write("JSON", 16);
      return Buffer.concat([header, padded]);
    };
    expect(inspectGlb(glb({ asset: { version: "2.0" }, nodes: [{ name: "retina" }, { name: "lens" }] }))).toMatchObject({
      ok: true,
      nodes: ["retina", "lens"],
    });
    expect(inspectGlb(glb({ asset: { version: "2.0" }, buffers: [{ uri: "https://cdn.example/b.bin" }] })).ok).toBe(false);
  });
  it("WebVTT needs a header and a timed cue", () => {
    expect(inspectVtt("WEBVTT\n\n00:00.000 --> 00:02.000\nXin chào").ok).toBe(true);
    expect(inspectVtt("hello").ok).toBe(false);
  });
});

import { applyBindings, packInputSchema, packValidation, resolveModel } from "./sim-packs";
const flagship = JSON.parse(readFileSync(new URL("../content/simulation-packs/flagship-fixture.json", import.meta.url), "utf8"));
const simPack = (i: number, patch: (p: any) => void = () => undefined) => {
  const raw = structuredClone({ ...flagship.items[i].pack, activityVersionId: "act-1" });
  patch(raw);
  return packInputSchema.parse(raw);
};
const simCtx = (labModelRef: string, glb: { nodes: string[]; animations?: string[] } | null = null) => ({
  labModelRef,
  activity: { spec: {} },
  glb,
  visualReady: Boolean(glb),
});

describe("simulation pack registry (CF-T4)", () => {
  it("the three flagship packs pass golden cases on the server engine", () => {
    for (const [i, ref] of ["circuit@1.0.0", "chemistry@1.0.0", "eye@1.0.0"].entries()) {
      const result = packValidation(simPack(i), simCtx(ref));
      expect(result.errors).toEqual([]);
      expect(result.golden.every((g) => g.ok)).toBe(true);
    }
  });
  it("unknown models fail closed and model/lab mismatches reject", () => {
    expect(() => resolveModel("plasma@9.9.9")).toThrow(/không nằm trong danh sách/);
    expect(
      packValidation(
        simPack(0, (p) => (p.modelRef = "plasma@1.0.0")),
        simCtx("circuit@1.0.0"),
      ).errors[0],
    ).toMatch(/không nằm trong danh sách/);
    expect(
      packValidation(
        simPack(0, (p) => (p.modelRef = "eye@1.0.0")),
        simCtx("circuit@1.0.0"),
      ).errors,
    ).toContain("mô hình eye@1.0.0 không thuộc phòng circuit");
  });
  it("out-of-range parameters, challenge ranges outside the template, missing nodes and unknown outputs reject", () => {
    const errors = packValidation(
      simPack(0, (p) => {
        p.template.ranges.maxCurrentMa = { min: 1, max: 50 };
        p.challengeTemplates[0].params.maxCurrentMa = { min: 0, max: 60 };
        delete p.semanticMap.led;
        p.bindings.push({ when: { output: "temperature", op: "gt", value: 1 }, target: "battery", effect: { type: "scale", value: 2 } });
      }),
      simCtx("circuit@1.0.0"),
    ).errors;
    expect(errors).toEqual(
      expect.arrayContaining([
        "khoảng maxCurrentMa phải nằm trong 5–20 mA",
        "mẫu thử thách gioi-han-dong: maxCurrentMa ngoài khoảng của mẫu",
        'bản đồ ngữ nghĩa thiếu nút bắt buộc "led"',
        'ràng buộc đọc đầu ra "temperature" không có trong mô hình',
      ]),
    );
  });
  it("executable or remote binding values cannot be parsed", () => {
    expect(() =>
      simPack(0, (p) =>
        p.bindings.push({
          when: { output: "status", op: "eq", value: "x" },
          target: "led",
          effect: { type: "label", value: "javascript:alert(1)" },
        }),
      ),
    ).toThrow();
    expect(() => simPack(0, (p) => (p.semanticMap.led = "https://cdn.example/led.glb"))).toThrow();
    expect(() => simPack(0, (p) => (p.script = "() => process.exit()"))).toThrow();
  });
  it("a golden case that does not reproduce and a GLB without the mapped nodes reject", () => {
    const wrong = packValidation(
      simPack(0, (p) => (p.template.goldenCases[2].expectedOutputs.current = 0.5)),
      simCtx("circuit@1.0.0"),
    );
    expect(wrong.golden[2]).toMatchObject({ ok: false, mismatches: ["current"] });
    const glb = packValidation(
      simPack(2, (p) => (p.visualAssetVersionId = "v1")),
      simCtx("eye@1.0.0", { nodes: ["cornea", "lens"] }),
    );
    expect(glb.errors.some((e) => e.includes('nút "retina" (retina) không có trong GLB'))).toBe(true);
  });
  it("bindings map engine output to allowlisted visual effects", () => {
    const pack = simPack(0);
    const output = resolveModel("circuit@1.0.0").simulate(pack.template.goldenCases[2].state);
    expect(applyBindings(pack.bindings, output)).toEqual([{ target: "led", effect: { type: "emissive", value: 2 } }]);
  });
});

describe("binding liveness (CF-T4)", () => {
  it("a binding that no golden case triggers is rejected", () => {
    const errors = packValidation(
      simPack(0, (p) =>
        p.bindings.push({ when: { output: "ledState", op: "eq", value: "on" }, target: "led", effect: { type: "scale", value: 2 } }),
      ),
      simCtx("circuit@1.0.0"),
    ).errors;
    expect(errors.some((e) => e.includes("không kích hoạt ở ca mẫu nào"))).toBe(true);
  });
});
