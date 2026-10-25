export function parseDevSeedArg(argv: string[], appEnv = process.env.APP_ENV) {
  const requested = argv.includes("--dev-seed");
  if (requested && appEnv !== "development") throw new Error("DEV_SEED_REQUIRES_DEVELOPMENT");
  return requested;
}
