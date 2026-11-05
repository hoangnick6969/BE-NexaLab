import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** certs/ sits at the package root: two levels up from src/db, three from dist/src/db. */
function bundledSupabaseCa() {
  for (let dir = __dirname, i = 0; i < 5; dir = dirname(dir), i++) {
    const file = join(dir, "certs", "supabase-root-2021.crt");
    if (existsSync(file)) return file;
  }
  return "";
}

export type DatabaseDriver = { adapter: PrismaPg; label: string } | { adapter: null; label: string };

/**
 * Chooses how the API talks to PostgreSQL.
 *
 * Prisma's own engine behind a transaction pooler needs `pgbouncer=true`, which costs about five
 * network round trips per query (~350 ms per query to the shared Supabase pooler, against ~70 ms for
 * one round trip). The node-postgres driver adapter sends each query in one round trip and needs no
 * prepared-statement cache, so it works with the transaction pooler.
 *
 * TLS to a remote database is always verified: with the CA from `DATABASE_SSL_CA_FILE`, or for
 * `*.supabase.com` with the bundled Supabase Root 2021 CA. A remote database without a CA, or
 * `DATABASE_DRIVER=engine`, keeps the Prisma engine (the previous behaviour).
 */
export function databaseDriver(env: NodeJS.ProcessEnv = process.env): DatabaseDriver {
  const raw = env.DATABASE_URL;
  if (!raw || env.DATABASE_DRIVER === "engine") return { adapter: null, label: "prisma-engine" };
  const url = new URL(raw);
  const poolSize = Number(url.searchParams.get("connection_limit")) || 10;
  for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
  const host = url.hostname;
  let ssl: { ca: string } | undefined;
  if (!LOOPBACK.has(host)) {
    const caFile = env.DATABASE_SSL_CA_FILE || (host.endsWith(".supabase.com") ? bundledSupabaseCa() : "");
    if (!caFile) return { adapter: null, label: "prisma-engine (no CA for remote TLS)" };
    ssl = { ca: readFileSync(caFile, "utf8") };
  }
  const adapter = new PrismaPg({ connectionString: url.toString(), max: poolSize, ssl });
  return { adapter, label: `pg-adapter pool=${poolSize}${ssl ? " tls=verified" : " loopback"}` };
}
