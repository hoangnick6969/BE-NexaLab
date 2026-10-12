import { describe, expect, it } from "vitest";
import { databaseUrl, seedUrl } from "./database-config";
const direct = "postgresql://user:secret@db.example:5432/postgres?sslmode=require";
describe("A1 database safeguards", () => {
  it("accepts direct or session SSL", () => expect(databaseUrl(direct)).toBe(direct));
  it("rejects transaction pool", () => expect(() => databaseUrl(direct.replace("5432", "6543"))).toThrow());
  it("rejects remote plaintext", () => expect(() => databaseUrl(direct.split("?")[0])).toThrow());
  it.each([undefined, "pilot", "staging", "production"])("refuses seed environment %s", APP_ENV => {
    expect(() => seedUrl({ APP_ENV, DIRECT_URL: direct, SEED_TARGET: "db.example/postgres" })).toThrow();
  });
  it("rejects mismatched target", () => expect(() => seedUrl({ APP_ENV: "test", DIRECT_URL: direct, SEED_TARGET: "other/postgres" })).toThrow());
  it("allows explicitly selected test target", () => expect(seedUrl({ APP_ENV: "test", DIRECT_URL: direct, SEED_TARGET: "db.example/postgres" })).toBe(direct));
  it("does not expose credentials in malformed URL error", () => {
    expect(() => databaseUrl("secret")).toThrow("Database URL missing or invalid");
  });
});
