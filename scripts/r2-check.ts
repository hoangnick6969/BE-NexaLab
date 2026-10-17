// Verifies the configured object storage end to end without printing secrets:
// server put/head/range/stream checksum, presigned PUT and GET from a plain
// HTTP client (as a browser would), multipart create/part/complete, delete.
//   npm run r2:check
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { storage, storageEnv } from "../src/infra/storage";

const s = storage();
const prefix = `${storageEnv()}/staging/r2-check-${Date.now().toString(36)}`;
const keys: string[] = [];
let failures = 0;
const step = async (label: string, run: () => Promise<boolean | void>) => {
  try {
    const ok = await run();
    if (ok === false) throw new Error("check returned false");
    console.log("PASS " + label);
  } catch (error: any) {
    failures++;
    console.log(`FAIL ${label}: ${error?.name ?? ""} ${String(error?.message ?? error).slice(0, 200)}`);
  }
};
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function main() {
  console.log(
    `storage=${s.kind} bucket=${s.bucket} env=${storageEnv()} endpointHost=${process.env.R2_ENDPOINT ? new URL(process.env.R2_ENDPOINT).hostname.replace(/^[0-9a-f]{32}/, "<account>") : "n/a"}`,
  );
  const body = Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(4096)]);
  const k1 = `${prefix}/server.pdf`;
  keys.push(k1);
  await step("server put + head size", async () => {
    await s.put(k1, body, "application/pdf");
    return (await s.head(k1))?.bytes === body.length;
  });
  await step("range read returns the signature", async () => (await s.readRange(k1, 0, 4)).toString() === "%PDF-");
  await step("streamed SHA-256 matches", async () => {
    const hash = createHash("sha256");
    for await (const chunk of await s.stream(k1)) hash.update(chunk as Buffer);
    return hash.digest("hex") === sha(body);
  });
  await step("presigned GET works without credentials", async () => {
    const url = await s.presignGet(k1, 60, { fileName: "kiểm tra.pdf", contentType: "application/pdf" });
    if (/X-Amz-Credential=.*&X-Amz-Signature=/.test(url) === false && s.kind === "r2") return false;
    const res = await fetch(url);
    return res.ok && sha(Buffer.from(await res.arrayBuffer())) === sha(body);
  });
  const k2 = `${prefix}/browser.png`;
  keys.push(k2);
  await step("presigned PUT accepts a browser-style upload", async () => {
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), randomBytes(1024)]);
    const res = await fetch(await s.presignPut(k2, "image/png", 60), {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: png,
    });
    return res.ok && (await s.head(k2))?.bytes === png.length;
  });
  const k3 = `${prefix}/multipart.bin`;
  keys.push(k3);
  await step("multipart create → presigned part → complete", async () => {
    const uploadId = await s.createMultipart(k3, "application/octet-stream");
    const part = randomBytes(64 * 1024);
    const res = await fetch(await s.presignPart(k3, uploadId, 1, 60), { method: "PUT", body: part });
    const etag = res.headers.get("etag");
    if (!res.ok || (s.kind === "r2" && !etag)) {
      await s.abortMultipart(k3, uploadId);
      throw new Error(`part upload ${res.status}${etag ? "" : " (no ETag exposed)"}`);
    }
    await s.completeMultipart(k3, uploadId, [{ partNumber: 1, etag: etag ?? "local" }]);
    return (await s.head(k3))?.bytes === part.length;
  });
  const k4 = `${prefix}/copied.pdf`;
  keys.push(k4);
  await step("server-side copy (staging → released)", async () => {
    await s.copy(k1, k4);
    return (await s.head(k4))?.bytes === body.length;
  });
  await step("expired presigned GET is refused", async () => {
    const url = await s.presignGet(k1, 1);
    await new Promise((r) => setTimeout(r, 2500));
    return !(await fetch(url)).ok;
  });
  await step("delete removes every probe object", async () => {
    for (const key of keys) await s.delete(key);
    for (const key of keys) if (await s.head(key)) return false;
  });
  console.log(failures ? `RESULT failed (${failures})` : "RESULT ok");
  process.exitCode = failures ? 1 : 0;
}
main();
