import { CIRCUIT_BULB_ACTIVITY_KEY } from "../application/lab-run";

/** Serialize suites that share the one model-allowlisted activity identity. */
export async function ensureCircuitBulbActivity(db: any, data: Record<string, unknown>) {
  return db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "nexalab:test:activity:" + CIRCUIT_BULB_ACTIVITY_KEY + "@1",
    );
    return (await tx.practicalActivityVersion.findUnique({
      where: { key_version: { key: CIRCUIT_BULB_ACTIVITY_KEY, version: 1 } },
    })) ?? tx.practicalActivityVersion.create({ data });
  });
}
