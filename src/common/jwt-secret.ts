/**
 * The HMAC/JWT secret. Throws when JWT_SECRET is missing instead of falling back to a guessable value, so scripts and
 * workers that import these modules outside main.ts cannot sign with a known key (security review 2026-11-16, item 3).
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}
