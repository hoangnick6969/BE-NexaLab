import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile, open, copyFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Object storage boundary (CF-T2, D19). Binaries live in private R2 (S3 API);
 * PostgreSQL keeps metadata only. Credentials stay on the server: clients only
 * ever receive short-lived presigned URLs. A local driver with the same
 * contract (HMAC-signed URLs served by the API) keeps development and tests
 * working without R2.
 */
export type HeadResult = { bytes: number; etag: string | null; contentType: string | null };
export interface ObjectStorage {
  readonly kind: "r2" | "local";
  readonly bucket: string;
  presignPut(key: string, contentType: string, ttlSeconds: number): Promise<string>;
  createMultipart(key: string, contentType: string): Promise<string>;
  presignPart(key: string, uploadId: string, partNumber: number, ttlSeconds: number): Promise<string>;
  completeMultipart(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  head(key: string): Promise<HeadResult | null>;
  readRange(key: string, start: number, endInclusive: number): Promise<Buffer>;
  stream(key: string): Promise<Readable>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  delete(key: string): Promise<void>;
  presignGet(key: string, ttlSeconds: number, options?: { fileName?: string; contentType?: string }): Promise<string>;
}

export const storageEnv = () => {
  const env = (process.env.APP_ENV ?? "development").toLowerCase();
  return ["development", "test", "pilot", "production"].includes(env) ? env : "development";
};
export const uploadTtl = () => Math.min(3600, Math.max(60, Number(process.env.R2_UPLOAD_TTL_SECONDS ?? 900) || 900));
export const readTtl = () => Math.min(3600, Math.max(30, Number(process.env.R2_READ_TTL_SECONDS ?? 300) || 300));

const safeName = (name: string) =>
  (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-80) || "file"
  ).toLowerCase();
/** Server-generated keys; the client never chooses bucket, key or scope. Staging and released objects never share a prefix. */
export const objectKeys = (assetId: string, versionId: string, fileName: string, scope: string) => ({
  staging: `${storageEnv()}/staging/${assetId}/${versionId}/${safeName(fileName)}`,
  released: `${storageEnv()}/assets/${scope === "SHARED_LIBRARY" ? "shared" : "private"}/${assetId}/${versionId}/${safeName(fileName)}`,
});

// ───────────────────────── R2 (S3 API) ─────────────────────────
class R2Storage implements ObjectStorage {
  readonly kind = "r2" as const;
  private client: S3Client;
  constructor(readonly bucket: string, endpoint: string, accessKeyId: string, secretAccessKey: string) {
    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // R2 does not implement the newer default CRC32 request checksums for presigned uploads.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  presignPut(key: string, contentType: string, ttlSeconds: number) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: ttlSeconds });
  }
  async createMultipart(key: string, contentType: string) {
    const out = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    if (!out.UploadId) throw new Error("multipart upload not created");
    return out.UploadId;
  }
  presignPart(key: string, uploadId: string, partNumber: number, ttlSeconds: number) {
    return getSignedUrl(this.client, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), {
      expiresIn: ttlSeconds,
    });
  }
  async completeMultipart(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
      }),
    );
  }
  async abortMultipart(key: string, uploadId: string) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId })).catch(() => undefined);
  }
  async head(key: string) {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { bytes: Number(out.ContentLength ?? 0), etag: out.ETag ?? null, contentType: out.ContentType ?? null };
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return null;
      throw error;
    }
  }
  async readRange(key: string, start: number, endInclusive: number) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${endInclusive}` }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }
  async stream(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return out.Body as Readable;
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async copy(from: string, to: string) {
    await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: to, CopySource: `${this.bucket}/${encodeURIComponent(from).replace(/%2F/g, "/")}` }));
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  presignGet(key: string, ttlSeconds: number, options: { fileName?: string; contentType?: string } = {}) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: options.contentType,
        ResponseContentDisposition: options.fileName ? `inline; filename*=UTF-8''${encodeURIComponent(options.fileName)}` : undefined,
      }),
      { expiresIn: ttlSeconds },
    );
  }
}

// ───────────────────────── local (development/test) ─────────────────────────
type LocalGrant = { op: "put" | "get" | "part"; key: string; exp: number; ct?: string; uploadId?: string; part?: number; name?: string };
const localSecret = () => createHmac("sha256", process.env.JWT_SECRET ?? "dev").update("nexalab:local-storage").digest();
export function signLocalGrant(grant: LocalGrant) {
  const body = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return body + "." + createHmac("sha256", localSecret()).update(body).digest("base64url");
}
export function verifyLocalGrant(token: string): LocalGrant | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", localSecret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const grant = JSON.parse(Buffer.from(body, "base64url").toString()) as LocalGrant;
  return grant.exp > Date.now() ? grant : null;
}
class LocalStorage implements ObjectStorage {
  readonly kind = "local" as const;
  readonly bucket = "local";
  constructor(
    private root: string,
    private publicBase: string,
  ) {}
  path(key: string) {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error("invalid object key");
    return full;
  }
  private url(grant: LocalGrant) {
    return `${this.publicBase}/storage/local/${signLocalGrant(grant)}`;
  }
  async presignPut(key: string, contentType: string, ttlSeconds: number) {
    return this.url({ op: "put", key, ct: contentType, exp: Date.now() + ttlSeconds * 1000 });
  }
  async createMultipart(key: string) {
    const uploadId = "local-" + createHmac("sha256", localSecret()).update(key + Date.now()).digest("hex").slice(0, 24);
    await mkdir(this.path(`.multipart/${uploadId}`), { recursive: true });
    return uploadId;
  }
  async presignPart(key: string, uploadId: string, partNumber: number, ttlSeconds: number) {
    return this.url({ op: "part", key, uploadId, part: partNumber, exp: Date.now() + ttlSeconds * 1000 });
  }
  async completeMultipart(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    const out = createWriteStream(target);
    for (const part of [...parts].sort((a, b) => a.partNumber - b.partNumber))
      await pipeline(createReadStream(this.path(`.multipart/${uploadId}/${part.partNumber}`)), out, { end: false });
    out.end();
    await new Promise<void>((r) => out.on("close", () => r()));
    await rm(this.path(`.multipart/${uploadId}`), { recursive: true, force: true });
  }
  async abortMultipart(_key: string, uploadId: string) {
    await rm(this.path(`.multipart/${uploadId}`), { recursive: true, force: true });
  }
  async head(key: string) {
    try {
      const info = await stat(this.path(key));
      return { bytes: info.size, etag: null, contentType: null };
    } catch {
      return null;
    }
  }
  async readRange(key: string, start: number, endInclusive: number) {
    const handle = await open(this.path(key), "r");
    try {
      const length = Math.max(0, endInclusive - start + 1);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }
  async stream(key: string) {
    return createReadStream(this.path(key));
  }
  async put(key: string, body: Buffer) {
    await mkdir(dirname(this.path(key)), { recursive: true });
    await writeFile(this.path(key), body);
  }
  async copy(from: string, to: string) {
    await mkdir(dirname(this.path(to)), { recursive: true });
    await copyFile(this.path(from), this.path(to));
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
  async presignGet(key: string, ttlSeconds: number, options: { fileName?: string; contentType?: string } = {}) {
    return this.url({ op: "get", key, ct: options.contentType, name: options.fileName, exp: Date.now() + ttlSeconds * 1000 });
  }
  /** Used by the local storage controller only. */
  async writePart(uploadId: string, part: number, body: Readable) {
    await mkdir(this.path(`.multipart/${uploadId}`), { recursive: true });
    await pipeline(body, createWriteStream(this.path(`.multipart/${uploadId}/${part}`)));
  }
  async writeObject(key: string, body: Readable) {
    await mkdir(dirname(this.path(key)), { recursive: true });
    await pipeline(body, createWriteStream(this.path(key)));
  }
  async list() {
    return readdir(this.root, { recursive: true }).catch(() => []);
  }
  readFile(key: string) {
    return readFile(this.path(key));
  }
}

let cached: ObjectStorage | null = null;
/** ASSET_STORAGE=r2 needs every R2_* variable; anything else falls back to the local driver. */
export function storage(): ObjectStorage {
  if (cached) return cached;
  if ((process.env.ASSET_STORAGE ?? "local") === "r2") {
    const required = ["R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const;
    const missing = required.filter((name) => !process.env[name] || process.env[name]!.includes("<"));
    if (missing.length) throw new Error("R2 storage is not configured: missing " + missing.join(", "));
    cached = new R2Storage(process.env.R2_BUCKET!, process.env.R2_ENDPOINT!, process.env.R2_ACCESS_KEY_ID!, process.env.R2_SECRET_ACCESS_KEY!);
  } else {
    const root = resolve(process.env.UPLOAD_DIR ?? "uploads", "objects");
    const base = (process.env.API_PUBLIC_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4000}/api`).replace(/\/$/, "");
    cached = new LocalStorage(root, base);
  }
  return cached;
}
export const localStorage = () => {
  const s = storage();
  return s.kind === "local" ? (s as LocalStorage) : null;
};
/** Test hook. */
export const resetStorage = () => {
  cached = null;
};
