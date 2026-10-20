import { describe, expect, it } from "vitest";
import { mergePreferences, preferencesUpdateSchema, readPreferences } from "./preferences";

describe("UI preferences (acc-4, acc-5)", () => {
  it("defaults to the system theme and no chosen language, ignoring malformed stored values", () => {
    expect(readPreferences({})).toEqual({ theme: "system", locale: null });
    expect(readPreferences(null)).toEqual({ theme: "system", locale: null });
    expect(readPreferences({ theme: "neon", locale: "fr", extra: 1 })).toEqual({ theme: "system", locale: null });
    expect(readPreferences({ theme: "dark", locale: "en" })).toEqual({ theme: "dark", locale: "en" });
  });

  it("merges a partial update and rejects unknown values and keys", () => {
    expect(mergePreferences({ theme: "dark" }, { locale: "en" })).toEqual({ theme: "dark", locale: "en" });
    expect(mergePreferences({ locale: "en" }, { theme: "light" })).toEqual({ theme: "light", locale: "en" });
    expect(mergePreferences({}, { theme: "dark" })).toEqual({ theme: "dark", locale: null });
    expect(preferencesUpdateSchema.safeParse({ theme: "neon" }).success).toBe(false);
    expect(preferencesUpdateSchema.safeParse({ locale: "fr" }).success).toBe(false);
    expect(preferencesUpdateSchema.safeParse({ font: "big" }).success).toBe(false);
  });
});
