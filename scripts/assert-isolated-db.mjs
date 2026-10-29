import "dotenv/config";

const mode = process.argv[2] ?? "database command";

function parse(name, value) {
  if (!value) throw new Error(`${name} is required for ${mode}. Set NEXALAB_ISOLATED_DATABASE_URL to an isolated local PostgreSQL target.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error(`${name} must use PostgreSQL.`);
  const host = url.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`${name} must point to a loopback database; remote targets are blocked.`);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || database.toLowerCase() === "postgres") throw new Error(`${name} must name a dedicated database, not the default postgres database.`);
  return { host, port: url.port || "5432", database };
}

try {
  const target = parse("NEXALAB_ISOLATED_DATABASE_URL", process.env.NEXALAB_ISOLATED_DATABASE_URL);
  for (const name of ["DATABASE_URL", "DIRECT_URL", "NEXALAB_PINNING_TEST_URL"]) {
    const value = process.env[name];
    if (!value) continue;
    const configured = parse(name, value);
    if (configured.host !== target.host || configured.port !== target.port || configured.database !== target.database) {
      throw new Error(`${name} does not match NEXALAB_ISOLATED_DATABASE_URL; refusing ${mode}.`);
    }
  }
  console.log(`Isolated database guard passed for ${mode} (${target.host}:${target.port}/${target.database}).`);
} catch (error) {
  console.error(`Database safety guard: ${error instanceof Error ? error.message : "invalid database target"}`);
  process.exitCode = 1;
}
