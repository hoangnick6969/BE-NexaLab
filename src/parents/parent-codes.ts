import { createHmac, randomBytes } from "node:crypto";

export const PARENT_CONSENT_VERSION = "2026-10-v1";
export const PARENT_CONSENT_HASH = createHmac("sha256", process.env.JWT_SECRET ?? "dev").update("PARENT_CHILD_PROGRESS|2026-10-v1|vi").digest("hex");
export const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function parentCode(): string {
  const bytes = randomBytes(13);
  let value = "";
  for (let i = 0; i < 20; i++) value += crockford[bytes[i % bytes.length] % crockford.length];
  return `NP-${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15)}`;
}
export function parentCodeHash(code: string): string {
  return createHmac("sha256", process.env.JWT_SECRET ?? "dev").update(code.toUpperCase()).digest("hex");
}
