import { jwtSecret } from "../../../common/jwt-secret";
import { createHmac, randomBytes } from "node:crypto";

export const PARENT_CONSENT_VERSION = "2026-10-v1";
/** Computed on use (not at import) so a missing JWT_SECRET fails loudly instead of hashing with a known key. */
export const parentConsentHash = () => createHmac("sha256", jwtSecret()).update("PARENT_CHILD_PROGRESS|2026-10-v1|vi").digest("hex");
export const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function parentCode(): string {
  const bytes = randomBytes(13);
  let value = "";
  for (let i = 0; i < 20; i++) value += crockford[bytes[i % bytes.length] % crockford.length];
  return `NP-${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15)}`;
}
export function parentCodeHash(code: string): string {
  return createHmac("sha256", jwtSecret()).update(code.toUpperCase()).digest("hex");
}
