import { describe, expect, it } from "vitest";
import { mergePreferences, preferencesUpdateSchema, readPreferences } from "./preferences";

describe("UI preferences (acc-4)", () => {
  it("defaults to the system theme and ignores malformed stored values", () => {
    expect(readPreferences({})).toEqual({ theme: "system" });
    expect(readPreferences(null)).toEqual({ theme: "system" });
    expect(readPreferences({ theme: "neon", extra: 1 })).toEqual({ theme: "system" });
    expect(readPreferences({ theme: "dark" })).toEqual({ theme: "dark" });
  });

  it("merges a partial update and rejects unknown themes and keys", () => {
    expect(mergePreferences({ theme: "dark" }, {})).toEqual({ theme: "dark" });
    expect(mergePreferences({}, { theme: "light" })).toEqual({ theme: "light" });
    expect(preferencesUpdateSchema.safeParse({ theme: "neon" }).success).toBe(false);
    expect(preferencesUpdateSchema.safeParse({ locale: "en" }).success).toBe(false);
  });
});
