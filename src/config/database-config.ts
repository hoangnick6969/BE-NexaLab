/** Validate without including credentials in errors. */
export function databaseUrl(value: string | undefined): string {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new Error("Database URL missing or invalid"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Database URL must use PostgreSQL");
  if (url.port === "6543" || url.searchParams.get("pgbouncer") === "true")
    throw new Error("A1 requires a direct or Session-pooler connection, not transaction pooling");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") ?? ""))
    throw new Error("Remote database requires SSL");
  return url.toString();
}

export function seedUrl(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === "production" || !["development", "test"].includes(env.APP_ENV ?? ""))
    throw new Error("Seed requires explicit APP_ENV=development or test; pilot/staging/production are forbidden");
  const url = databaseUrl(env.DIRECT_URL);
  const target = new URL(url);
  if (env.SEED_TARGET !== `${target.hostname}${target.pathname}`)
    throw new Error("SEED_TARGET must match DIRECT_URL hostname/database before seeding");
  return url;
}
