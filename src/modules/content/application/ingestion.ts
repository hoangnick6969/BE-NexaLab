import { z } from "zod";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { storage, storageEnv } from "../../storage/infrastructure/storage";
import { SOURCE_LICENSES } from "./content-pack";

/**
 * CF-T3 controlled ingestion. A SourcePolicy says which connector may fetch
 * what, from where, under which licence and limits. A run stages candidates
 * (IngestionItem + SourceArtifactVersion); nothing here creates learning
 * content or publishes anything.
 */
export const PARSER_VERSIONS = { "http-document": "http-document@1", pubchem: "pubchem-properties@1" } as const;
export const sourcePolicySchema = z
  .object({
    accessMode: z.enum(["OPEN_BULK_IMPORT", "API", "MANUAL_REFERENCE", "MANUAL_UPLOAD", "BOUNDED_CRAWL"]),
    connector: z.enum(["http-document", "pubchem"]),
    allowedHosts: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    allowedPathPrefixes: z.array(z.string().startsWith("/").max(300)).min(1).max(20),
    allowedMime: z.array(z.string().max(100)).min(1).max(10),
    maxBytes: z
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024),
    /** Item-level licence the source grants; unclear or NC/ND licences are rejected before any fetch. */
    license: z
      .object({ code: z.enum(SOURCE_LICENSES), url: z.string().url().optional(), attribution: z.string().trim().min(2).max(300) })
      .strict(),
    storagePolicy: z.enum(["METADATA_ONLY", "SNAPSHOT"]),
    rateLimitPerMinute: z.number().int().min(1).max(120),
    termsReviewedAt: z.string().date(),
    recheckAt: z.string().date(),
    /** Optional allowlist of external IDs (e.g. PubChem CIDs). */
    idAllowlist: z.array(z.string().max(100)).max(1000).optional(),
    contact: z.string().trim().max(200).optional(),
  })
  .strict();
export type SourcePolicyBody = z.infer<typeof sourcePolicySchema>;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i;
const allowPrivate = () => ["development", "test"].includes(storageEnv()) && process.env.ALLOW_PRIVATE_SOURCE_HOSTS === "true";

/** Reasons the source may not be fetched at all right now. */
export function preFetchProblems(policy: SourcePolicyBody, enabled: boolean, now = new Date()) {
  const problems: string[] = [];
  if (!enabled) problems.push("nguồn đang tắt");
  if (policy.accessMode === "BOUNDED_CRAWL") problems.push("chế độ crawl có giới hạn chưa được bật trong MVP");
  if (policy.accessMode === "MANUAL_UPLOAD") problems.push("nguồn tải lên thủ công không có connector tự động");
  if (!["ORIGINAL", "CC0", "PUBLIC_DOMAIN", "CC_BY", "CC_BY_SA", "SCHOOL_OWNED", "REFERENCE_ONLY"].includes(policy.license.code))
    problems.push(`giấy phép ${policy.license.code} không được phép`);
  if (policy.license.code === "REFERENCE_ONLY" && policy.storagePolicy !== "METADATA_ONLY")
    problems.push("nguồn chỉ tham chiếu không được lưu bản sao");
  if (new Date(policy.recheckAt) < now) problems.push("đã quá hạn rà soát lại điều khoản nguồn");
  if (now.getTime() - new Date(policy.termsReviewedAt).getTime() > 400 * 86400000)
    problems.push("điều khoản nguồn chưa được rà soát trong 13 tháng");
  return problems;
}

/** Host/path allowlist plus a private-network guard (SSRF). */
export function urlProblem(raw: string, policy: SourcePolicyBody) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "URL không hợp lệ";
  }
  if (!["https:", ...(allowPrivate() ? ["http:"] : [])].includes(url.protocol)) return "chỉ cho phép HTTPS";
  if (!policy.allowedHosts.includes(url.host)) return `host ${url.host} ngoài danh sách cho phép`;
  if (!policy.allowedPathPrefixes.some((p) => url.pathname.startsWith(p))) return `đường dẫn ${url.pathname} ngoài phạm vi cho phép`;
  if ((PRIVATE_HOST.test(url.hostname) || (isIP(url.hostname) && PRIVATE_HOST.test(url.hostname))) && !allowPrivate())
    return "không được gọi vào mạng nội bộ";
  return null;
}

/** robots.txt (RFC 9309) for `*`: longest matching Allow/Disallow wins. */
export function robotsAllows(robots: string, path: string) {
  let applies = false;
  const rules: Array<{ allow: boolean; prefix: string }> = [];
  for (const line of robots.split(/\r?\n/)) {
    const [field, ...rest] = line.replace(/#.*/, "").split(":");
    const value = rest.join(":").trim();
    const key = field.trim().toLowerCase();
    if (key === "user-agent") applies = value === "*" || value.toLowerCase().startsWith("nexalab");
    else if (applies && (key === "allow" || key === "disallow") && value) rules.push({ allow: key === "allow", prefix: value });
  }
  const match = rules
    .filter((r) => path.startsWith(r.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length || Number(b.allow) - Number(a.allow))[0];
  return !match || match.allow;
}

export type Fetched = { url: string; status: number; mime: string; bytes: Buffer; headers: Record<string, string> };
/** Bounded fetch: manual redirects re-checked against the allowlist, size cap while streaming, MIME check. */
export async function boundedFetch(raw: string, policy: SourcePolicyBody, fetcher: typeof fetch = fetch): Promise<Fetched> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const problem = urlProblem(url, policy);
    if (problem) throw new Error(problem);
    const res = await fetcher(url, {
      redirect: "manual",
      headers: { "user-agent": "NexaLab-ingestion/1 (+contact via admin)" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error("chuyển hướng không có đích");
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`nguồn trả về ${res.status}`);
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!policy.allowedMime.includes(mime)) throw new Error(`kiểu ${mime || "không rõ"} ngoài danh sách cho phép`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > policy.maxBytes) throw new Error("vượt giới hạn kích thước");
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res.body as any) {
      total += chunk.length;
      if (total > policy.maxBytes) throw new Error("vượt giới hạn kích thước");
      chunks.push(Buffer.from(chunk));
    }
    const headers: Record<string, string> = {};
    for (const name of ["content-type", "content-length", "etag", "last-modified"]) {
      const value = res.headers.get(name);
      if (value) headers[name] = value;
    }
    return { url, status: res.status, mime, bytes: Buffer.concat(chunks), headers };
  }
  throw new Error("quá nhiều lần chuyển hướng");
}

/** Connector: candidate URL for one external ID, and the normalized record for a fetched body. */
export const connectors = {
  "http-document": {
    url: (externalId: string, item: { url?: string }) => item.url ?? externalId,
    normalize: (f: Fetched) => ({ mime: f.mime, bytes: f.bytes.length, headers: f.headers }),
  },
  pubchem: {
    url: (externalId: string) =>
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${encodeURIComponent(externalId)}/property/Title,MolecularFormula,IUPACName/JSON`,
    normalize: (f: Fetched) => {
      const props = JSON.parse(f.bytes.toString("utf8"))?.PropertyTable?.Properties?.[0];
      if (!props?.CID) throw new Error("phản hồi PubChem không đúng cấu trúc");
      return { kind: "SCIENCE_RECORD", cid: props.CID, title: props.Title, formula: props.MolecularFormula, iupacName: props.IUPACName };
    },
  },
} as const;

export type RunInput = { items: Array<{ externalId: string; url?: string; locator?: string }> };
/**
 * Runs one bounded ingestion pass and returns its counts. Every candidate ends
 * STAGED, DUPLICATE, REJECTED or NEEDS_REVIEW; nothing becomes content.
 */
export async function runIngestion(
  db: any,
  source: { key: string; enabled: boolean; currentVersion: number },
  policyVersion: { id: string; policy: unknown },
  input: RunInput,
  actor: { sub: string } | null,
  options: { fetcher?: typeof fetch; trigger?: string; sleep?: (ms: number) => Promise<void> } = {},
) {
  const policy = sourcePolicySchema.parse(policyVersion.policy);
  const connector = connectors[policy.connector];
  const run = await db.ingestionRun.create({
    data: {
      sourceKey: source.key,
      policyVersionId: policyVersion.id,
      connector: policy.connector,
      parserVersion: PARSER_VERSIONS[policy.connector],
      trigger: options.trigger ?? "admin",
      startedById: actor?.sub ?? null,
    },
  });
  const counts = { STAGED: 0, DUPLICATE: 0, REJECTED: 0, NEEDS_REVIEW: 0 };
  const blocked = preFetchProblems(policy, source.enabled);
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const fetcher = options.fetcher ?? fetch;
  const robotsCache = new Map<string, string>();
  const record = async (externalId: string, url: string | null, status: keyof typeof counts, extra: Record<string, unknown> = {}) => {
    counts[status]++;
    await db.ingestionItem.create({ data: { runId: run.id, externalId, url, status, ...extra } });
  };
  for (const [index, item] of input.items.entries()) {
    const url = connector.url(item.externalId, item);
    if (blocked.length) {
      await record(item.externalId, url, "REJECTED", { rejection: blocked.join("; ") });
      continue;
    }
    if (policy.idAllowlist && !policy.idAllowlist.includes(item.externalId)) {
      await record(item.externalId, url, "REJECTED", { rejection: "mã ngoài danh sách cho phép" });
      continue;
    }
    if (index > 0) await sleep(Math.ceil(60000 / policy.rateLimitPerMinute));
    try {
      const parsed = new URL(url);
      if (!urlProblem(url, policy)) {
        const origin = parsed.origin;
        if (!robotsCache.has(origin)) {
          const robots = await fetcher(origin + "/robots.txt", { signal: AbortSignal.timeout(10000) }).catch(() => null);
          robotsCache.set(origin, robots && robots.ok ? await robots.text() : "");
        }
        if (!robotsAllows(robotsCache.get(origin)!, parsed.pathname)) throw new Error("robots.txt không cho phép đường dẫn này");
      }
      const fetched = await boundedFetch(url, policy, fetcher);
      const sha256 = createHash("sha256").update(fetched.bytes).digest("hex");
      let normalized: unknown;
      try {
        normalized = connector.normalize(fetched);
      } catch (error: any) {
        await record(item.externalId, url, "NEEDS_REVIEW", { rejection: String(error?.message ?? error).slice(0, 300), sha256 });
        continue;
      }
      const artifact = await db.sourceArtifact.upsert({
        where: { sourceKey_externalId: { sourceKey: source.key, externalId: item.externalId } },
        create: { sourceKey: source.key, externalId: item.externalId, title: (normalized as any)?.title ?? null },
        update: {},
      });
      const existing = await db.sourceArtifactVersion.findUnique({ where: { artifactId_sha256: { artifactId: artifact.id, sha256 } } });
      if (existing) {
        await record(item.externalId, url, "DUPLICATE", { sha256, artifactVersionId: existing.id });
        continue;
      }
      let rawObjectKey: string | null = null;
      if (policy.storagePolicy === "SNAPSHOT") {
        rawObjectKey = `${storageEnv()}/sources/${source.key}/${artifact.id}/${sha256}`;
        await storage().put(rawObjectKey, fetched.bytes, fetched.mime);
      }
      const last = await db.sourceArtifactVersion.findFirst({
        where: { artifactId: artifact.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = await db.sourceArtifactVersion.create({
        data: {
          artifactId: artifact.id,
          version: (last?.version ?? 0) + 1,
          canonicalUrl: fetched.url,
          retrievedAt: new Date(),
          sha256,
          mime: fetched.mime,
          bytes: fetched.bytes.length,
          licenseSnapshot: { ...policy.license, policyVersionId: policyVersion.id },
          locator: item.locator ?? null,
          parserVersion: PARSER_VERSIONS[policy.connector],
          storagePolicy: policy.storagePolicy,
          rawObjectKey,
          normalized: (normalized ?? undefined) as any,
        },
      });
      await record(item.externalId, url, "STAGED", { sha256, artifactVersionId: version.id });
    } catch (error: any) {
      await record(item.externalId, url, "REJECTED", { rejection: String(error?.message ?? error).slice(0, 300) });
    }
  }
  return db.ingestionRun.update({
    where: { id: run.id },
    data: { status: "COMPLETED", counts, finishedAt: new Date() },
    include: { items: true },
  });
}
