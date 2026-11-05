import { describe, expect, it } from "vitest";
import { databaseDriver } from "./database-connection";

describe("databaseDriver", () => {
  it("uses the pg adapter without TLS for a loopback database", () => {
    const driver = databaseDriver({ DATABASE_URL: "postgresql://u@127.0.0.1:5432/db?connection_limit=4" });
    expect(driver.adapter).not.toBeNull();
    expect(driver.label).toBe("pg-adapter pool=4 loopback");
  });

  it("verifies TLS with the bundled Supabase CA for the shared pooler", () => {
    const driver = databaseDriver({ DATABASE_URL: "postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true" });
    expect(driver.adapter).not.toBeNull();
    expect(driver.label).toBe("pg-adapter pool=10 tls=verified");
  });

  it("keeps the Prisma engine for a remote host without a CA", () => {
    const driver = databaseDriver({ DATABASE_URL: "postgresql://u:p@db.example.org:5432/postgres?sslmode=require" });
    expect(driver.adapter).toBeNull();
  });

  it("keeps the Prisma engine when DATABASE_DRIVER=engine", () => {
    const driver = databaseDriver({ DATABASE_URL: "postgresql://u@127.0.0.1:5432/db", DATABASE_DRIVER: "engine" });
    expect(driver.adapter).toBeNull();
  });
});
