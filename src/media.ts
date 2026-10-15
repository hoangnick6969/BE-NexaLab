import { extname } from "node:path";

/**
 * Configuration-driven media validation (CF-T2, C2-T5). Budgets default to the
 * development proposal (video: Q-DATA-01 proposal 300 MB). In pilot/production
 * uploads stay disabled until ASSET_BUDGETS_APPROVED=true records that
 * Q-DATA-01 and Q-C2-03 approved the configured limits.
 */
const MB = 1024 * 1024;
export type MediaKind = "pdf" | "image" | "video" | "caption" | "model";
export type MediaType = {
  kind: MediaKind;
  mime: string;
  extensions: string[];
  maxBytes: number;
  signature: (head: Buffer) => boolean;
};
const envMb = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value * MB : fallback * MB;
};
export const mediaTypes = (): MediaType[] => [
  { kind: "pdf", mime: "application/pdf", extensions: [".pdf"], maxBytes: envMb("ASSET_MAX_PDF_MB", 20), signature: (b) => b.subarray(0, 5).toString() === "%PDF-" },
  {
    kind: "image",
    mime: "image/png",
    extensions: [".png"],
    maxBytes: envMb("ASSET_MAX_IMAGE_MB", 10),
    signature: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  {
    kind: "image",
    mime: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    maxBytes: envMb("ASSET_MAX_IMAGE_MB", 10),
    signature: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
  { kind: "video", mime: "video/mp4", extensions: [".mp4"], maxBytes: envMb("ASSET_MAX_VIDEO_MB", 300), signature: (b) => b.subarray(4, 8).toString() === "ftyp" },
  {
    kind: "caption",
    mime: "text/vtt",
    extensions: [".vtt"],
    maxBytes: envMb("ASSET_MAX_CAPTION_MB", 1),
    signature: (b) => b.toString("utf8").replace(/^﻿/, "").startsWith("WEBVTT"),
  },
  { kind: "model", mime: "model/gltf-binary", extensions: [".glb"], maxBytes: envMb("ASSET_MAX_MODEL_MB", 50), signature: (b) => b.subarray(0, 4).toString() === "glTF" },
];
/** Largest multipart part we hand out; R2 needs ≥5 MiB for every part but the last. */
export const PART_SIZE = 16 * MB;
export const SINGLE_PUT_LIMIT = 64 * MB;

export function mediaTypeFor(fileName: string, mime: string) {
  const extension = extname(fileName).toLowerCase();
  return mediaTypes().find((t) => t.mime === mime && t.extensions.includes(extension)) ?? null;
}

export function uploadsEnabled(env = process.env) {
  const appEnv = (env.APP_ENV ?? "development").toLowerCase();
  if (["pilot", "production"].includes(appEnv) && env.ASSET_BUDGETS_APPROVED !== "true")
    return { enabled: false, reason: "Hạn mức tải lên cho môi trường này chưa được duyệt (Q-DATA-01, Q-C2-03)" };
  return { enabled: true, reason: null };
}

/**
 * Security scanning hook. No scanner is configured in development; that is
 * recorded honestly and blocks READY in pilot/production.
 */
export function scanStatus(env = process.env) {
  if (env.MALWARE_SCANNER_URL) return "pending-external";
  return ["pilot", "production"].includes((env.APP_ENV ?? "development").toLowerCase()) ? "required-not-configured" : "not-configured-development";
}

/** Reads the GLB JSON chunk: node/mesh/material inventory and any external or script reference. */
export function inspectGlb(head: Buffer) {
  if (head.length < 20 || head.subarray(0, 4).toString() !== "glTF") return { ok: false, problems: ["không phải tệp GLB"], nodes: [] as string[] };
  const version = head.readUInt32LE(4);
  const jsonLength = head.readUInt32LE(12);
  const chunkType = head.subarray(16, 20).toString();
  if (version !== 2 || chunkType !== "JSON") return { ok: false, problems: ["GLB phải là glTF 2.0 với chunk JSON đầu tiên"], nodes: [] };
  if (head.length < 20 + jsonLength) return { ok: false, problems: ["chunk JSON vượt quá phần đã đọc"], nodes: [], needBytes: 20 + jsonLength };
  let json: any;
  try {
    json = JSON.parse(head.subarray(20, 20 + jsonLength).toString("utf8"));
  } catch {
    return { ok: false, problems: ["chunk JSON không hợp lệ"], nodes: [] };
  }
  const problems: string[] = [];
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])].map((item: any) => item?.uri).filter(Boolean);
  if (uris.length) problems.push("GLB tham chiếu tài nguyên ngoài (uri); mọi buffer/ảnh phải được đóng gói");
  const raw = JSON.stringify(json);
  if (/KHR_interactivity|"script"|javascript:/i.test(raw)) problems.push("GLB chứa thành phần có thể thực thi");
  const nodes: string[] = (json.nodes ?? []).map((n: any) => String(n?.name ?? "")).filter(Boolean);
  const duplicates = nodes.filter((n, i) => nodes.indexOf(n) !== i);
  return {
    ok: problems.length === 0,
    problems,
    nodes,
    duplicateNodes: [...new Set(duplicates)],
    meshes: (json.meshes ?? []).length,
    materials: (json.materials ?? []).length,
    animations: (json.animations ?? []).map((a: any) => String(a?.name ?? "")).filter(Boolean),
  };
}

/** WebVTT basic structure: header line and at least one timing cue. */
export function inspectVtt(text: string) {
  const body = text.replace(/^﻿/, "");
  const cues = (body.match(/\d{2}:\d{2}(?::\d{2})?\.\d{3}\s+-->\s+\d{2}:\d{2}(?::\d{2})?\.\d{3}/g) ?? []).length;
  return { ok: body.startsWith("WEBVTT") && cues > 0, cues };
}
