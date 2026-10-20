import { z } from "zod";

/** UI preferences stored on the user (acc-4). The FE also keeps them locally, so these only follow the user across devices. */
export const THEMES = ["system", "light", "dark"] as const;

export const preferencesUpdateSchema = z.object({ theme: z.enum(THEMES).optional() }).strict();
export type Preferences = { theme: (typeof THEMES)[number] };

/** Unknown or malformed stored values fall back to defaults instead of failing the profile read. */
export function readPreferences(stored: unknown): Preferences {
  const value = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return { theme: THEMES.includes(value.theme as any) ? (value.theme as Preferences["theme"]) : "system" };
}

export function mergePreferences(stored: unknown, update: z.infer<typeof preferencesUpdateSchema>): Preferences {
  return { ...readPreferences(stored), ...Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined)) };
}
