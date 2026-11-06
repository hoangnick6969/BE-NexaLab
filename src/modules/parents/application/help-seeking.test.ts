import { describe, expect, it } from "vitest";
import { summarizeHelpSeeking } from "./help-seeking";

const at = (iso: string) => new Date(iso);

describe("SAI-05 help-seeking summary", () => {
  it("counts hints by level and reflections per Lab, newest Lab first, with nothing but counts", () => {
    const out = summarizeHelpSeeking([
      { level: 1, createdAt: at("2026-11-01T08:00:00Z"), labId: "food-web" },
      { level: 2, createdAt: at("2026-11-01T08:05:00Z"), labId: "food-web" },
      { level: 0, createdAt: at("2026-11-01T08:06:00Z"), labId: "food-web" },
      { level: 3, createdAt: at("2026-11-01T08:10:00Z"), labId: "food-web" },
      { level: 1, createdAt: at("2026-11-03T09:00:00Z"), labId: "circuit-bulb" },
      { level: 2, createdAt: at("2026-11-04T09:00:00Z"), labId: null },
    ], new Map([["food-web", "Lưới thức ăn"]]));
    expect(out).toEqual([
      { labId: "circuit-bulb", labTitle: "Bài thí nghiệm không còn khả dụng", total: 1, byLevel: { 1: 1, 2: 0, 3: 0, 4: 0 }, reflections: 0, lastAt: "2026-11-03T09:00:00.000Z" },
      { labId: "food-web", labTitle: "Lưới thức ăn", total: 4, byLevel: { 1: 1, 2: 1, 3: 1, 4: 0 }, reflections: 1, lastAt: "2026-11-01T08:10:00.000Z" },
    ]);
    for (const lab of out) expect(Object.keys(lab).sort()).toEqual(["byLevel", "labId", "labTitle", "lastAt", "reflections", "total"]);
  });

  it("is empty without hints", () => {
    expect(summarizeHelpSeeking([], new Map())).toEqual([]);
  });
});
