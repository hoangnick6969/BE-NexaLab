import { ConflictException } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Class join codes (B1-T3): `NL-LLLLLL-SSSSSSSSSS` in uppercase Crockford
 * Base32. `L` is an opaque random locator; `S` is a separate 50-bit CSPRNG
 * secret stored only as a key-versioned HMAC.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LOCATOR_LENGTH = 6;
export const SECRET_LENGTH = 10;

export function randomBase32(length: number) {
  // 5 bits per character from an unbiased byte stream.
  const bytes = randomBytes(Math.ceil((length * 5) / 8) + 1);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

export const formatJoinCode = (locator: string, secret: string) => `NL-${locator}-${secret}`;

/** Accepts spacing/dash/case variations and Crockford look-alikes (O→0, I/L→1). */
export function parseJoinCode(input: string): { locator: string; secret: string } | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, "");
  if (!compact.startsWith("NL")) return null;
  const body = compact.slice(2).replace(/O/g, "0").replace(/[IL]/g, "1");
  if (body.length !== LOCATOR_LENGTH + SECRET_LENGTH) return null;
  if ([...body].some((ch) => !ALPHABET.includes(ch))) return null;
  return {
    locator: body.slice(0, LOCATOR_LENGTH),
    secret: body.slice(LOCATOR_LENGTH),
  };
}

type KeyRing = { current: number; keys: Map<number, Buffer> };
let cachedRing: KeyRing | null = null;

/**
 * `JOIN_CODE_HMAC_KEYS="1:<base64>,2:<base64>"` and `JOIN_CODE_HMAC_KEY_VERSION`.
 * Outside production a development key is derived from JWT_SECRET.
 */
export function keyRing(env = process.env): KeyRing {
  if (cachedRing && env === process.env) return cachedRing;
  const keys = new Map<number, Buffer>();
  for (const entry of (env.JOIN_CODE_HMAC_KEYS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const [version, material] = entry.split(":");
    const key = Buffer.from(material ?? "", "base64");
    if (!/^\d+$/.test(version) || key.length < 32) throw new Error("JOIN_CODE_HMAC_KEYS entries must be <version>:<base64 ≥32 bytes>");
    keys.set(Number(version), key);
  }
  const production = env.NODE_ENV === "production" || env.APP_ENV === "production";
  if (!keys.size) {
    if (production || !env.JWT_SECRET) throw new Error("JOIN_CODE_HMAC_KEYS is required");
    keys.set(1, createHmac("sha256", env.JWT_SECRET).update("nexalab-join-code-development-v1").digest());
  }
  const current = Number(env.JOIN_CODE_HMAC_KEY_VERSION ?? Math.max(...keys.keys()));
  if (!keys.has(current)) throw new Error("JOIN_CODE_HMAC_KEY_VERSION has no key");
  const ring = { current, keys };
  if (env === process.env) cachedRing = ring;
  return ring;
}

export function hashSecret(locator: string, secret: string, version: number, ring = keyRing()) {
  const key = ring.keys.get(version);
  if (!key) return null;
  return createHmac("sha256", key).update(`${locator}:${secret}`).digest("hex");
}

export function issueJoinCode(ring = keyRing()) {
  const locator = randomBase32(LOCATOR_LENGTH);
  const secret = randomBase32(SECRET_LENGTH);
  return {
    code: formatJoinCode(locator, secret),
    locator,
    keyVersion: ring.current,
    secretHash: hashSecret(locator, secret, ring.current, ring)!,
  };
}

export type IssuedJoinCode = ReturnType<typeof issueJoinCode>;

const isLocatorCollision = (error: any) =>
  error?.code === "P2002" && /joinLocator/i.test(JSON.stringify(error?.meta?.target ?? error?.message ?? ""));

/**
 * Runs `work` with a fresh code, drawing again when the random locator collides
 * with an existing class (unique `joinLocator`). Each try is a new transaction,
 * because PostgreSQL aborts the transaction that hit the unique violation.
 */
export async function withFreshJoinCode<T>(
  work: (code: IssuedJoinCode) => Promise<T>,
  issue: () => IssuedJoinCode = issueJoinCode,
  attempts = 5,
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await work(issue());
    } catch (error) {
      if (!isLocatorCollision(error)) throw error;
    }
  }
  throw new ConflictException({
    code: "JOIN_CODE_COLLISION",
    message: "Không tạo được mã mới, hãy thử lại",
  });
}

const DUMMY_HASH = "0".repeat(64);

/**
 * Constant-shape verification: an unknown class or key version still runs one
 * HMAC and one comparison so invalid and valid codes take the same path.
 */
export function verifySecret(
  parsed: { locator: string; secret: string } | null,
  stored: {
    joinSecretHash: string | null;
    joinKeyVersion: number | null;
  } | null,
  ring = keyRing(),
) {
  const version = stored?.joinKeyVersion ?? ring.current;
  const candidate =
    hashSecret(parsed?.locator ?? "000000", parsed?.secret ?? "0000000000", ring.keys.has(version) ? version : ring.current, ring) ??
    DUMMY_HASH;
  const expected = stored?.joinSecretHash && /^[0-9a-f]{64}$/.test(stored.joinSecretHash) ? stored.joinSecretHash : DUMMY_HASH;
  const equal = timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(expected, "hex"));
  return equal && Boolean(parsed && stored?.joinSecretHash && ring.keys.has(version));
}
