import { describe, expect, it } from "vitest";
import { assertAvatarObject, assertOwnAvatarKey, AVATAR_MAX_BYTES, avatarUploadSchema, newAvatarKey, profileUpdateSchema, releasedAvatarKey } from "./avatar";

const code = (value: string) => expect.objectContaining({ response: expect.objectContaining({ code: value }) });

describe("avatar rules (D-ACC-03)", () => {
  it("issues upload keys under the caller's staging prefix and releases them to the avatar prefix", () => {
    const key = newAvatarKey("development", "user-1", "image/webp");
    expect(key).toMatch(/^development\/staging\/avatars\/user-1\/[0-9a-f-]{36}\.webp$/);
    expect(() => assertOwnAvatarKey(key, "development", "user-1")).not.toThrow();
    expect(releasedAvatarKey(key, "development", "user-1")).toBe(key.replace("development/staging/avatars/", "development/avatars/"));
  });

  it("refuses another user's key, traversal and unknown extensions", () => {
    const key = newAvatarKey("development", "user-1", "image/png");
    expect(() => assertOwnAvatarKey(key, "development", "user-2")).toThrow(code("AVATAR_KEY_INVALID"));
    expect(() => assertOwnAvatarKey("development/staging/avatars/user-1/../user-2/x.png", "development", "user-1")).toThrow(code("AVATAR_KEY_INVALID"));
    // A released key cannot be re-confirmed: confirmation only accepts staging keys.
    expect(() => assertOwnAvatarKey(releasedAvatarKey(key, "development", "user-1"), "development", "user-1")).toThrow(code("AVATAR_KEY_INVALID"));
    expect(() => assertOwnAvatarKey(key.replace(".png", ".svg"), "development", "user-1")).toThrow(code("AVATAR_KEY_INVALID"));
    expect(() => assertOwnAvatarKey(key, "production", "user-1")).toThrow(code("AVATAR_KEY_INVALID"));
  });

  it("accepts only small PNG, JPEG or WebP uploads", () => {
    expect(avatarUploadSchema.safeParse({ contentType: "image/jpeg", bytes: 1000 }).success).toBe(true);
    expect(avatarUploadSchema.safeParse({ contentType: "image/svg+xml", bytes: 1000 }).success).toBe(false);
    expect(avatarUploadSchema.safeParse({ contentType: "image/png", bytes: AVATAR_MAX_BYTES + 1 }).success).toBe(false);
  });

  it("checks the stored object, not the client's claim", () => {
    expect(() => assertAvatarObject(null)).toThrow(code("AVATAR_NOT_UPLOADED"));
    expect(() => assertAvatarObject({ bytes: AVATAR_MAX_BYTES + 1, contentType: "image/png" })).toThrow(code("AVATAR_TOO_LARGE"));
    expect(() => assertAvatarObject({ bytes: 10, contentType: "text/html" })).toThrow(code("AVATAR_TYPE_INVALID"));
    expect(() => assertAvatarObject({ bytes: 10, contentType: "image/webp" })).not.toThrow();
  });

  it("trims and bounds a display name", () => {
    expect(profileUpdateSchema.parse({ fullName: "  Cô Lan  " }).fullName).toBe("Cô Lan");
    expect(profileUpdateSchema.safeParse({ fullName: " " }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ fullName: "A", role: "ADMIN" }).success).toBe(false);
  });
});
