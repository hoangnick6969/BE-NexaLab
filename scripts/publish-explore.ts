// Owner publish of Explore benches through the Admin API (P0 C1.3): POST /admin/labs/:id/explore-versions.
//
// Dry run by default. For each selected Lab it checks the bundled config against the bench registry and the
// controller's request schema, checks the topic code against the content catalog, and writes the exact request
// bodies to a JSON file. It sends nothing unless `--publish` is passed AND NEXALAB_ADMIN_API_URL and
// NEXALAB_ADMIN_TOKEN are both set.
//
//   tsx scripts/publish-explore.ts --kit k8-diorama            # dry run, all Labs of the kit
//   tsx scripts/publish-explore.ts --lab fl-21-explore         # dry run, one Lab
//   tsx scripts/publish-explore.ts --lab fl-21-explore --publish --reason "..."   # real request (owner only)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { EXPLORE_BENCHES } from "../src/modules/labs/application/explore-labs";
import { EXPLORE_TARGETS, type ExploreTarget } from "./explore-targets";

const CATALOG = resolve(__dirname, "../../NEXA-LAB_Content tool/catalog-registry.json");
// Same rules as admin-labs.controller.ts (publishExploreVersion) and admin-api.ts (reason).
const requestSchema = (labId: string) =>
  z.object({
    config: z.object({ labId: z.literal(labId) }).passthrough(),
    topicCode: z.string().min(1).max(80),
    reason: z.string().trim().min(3, "Cần nêu lý do (ít nhất 3 ký tự)").max(500),
  }).strict();

function catalogTopicCodes(): Set<string> | null {
  if (!existsSync(CATALOG)) return null;
  const codes = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (typeof record.code === "string" && typeof record.title === "string") codes.add(record.code);
      Object.values(record).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(CATALOG, "utf8")));
  return codes;
}

async function main() {
  const { values } = parseArgs({
    options: {
      kit: { type: "string" }, lab: { type: "string" }, publish: { type: "boolean" },
      reason: { type: "string" }, out: { type: "string" },
    },
  });
  if (!values.kit && !values.lab) throw new Error("Usage: --kit <bench-id> | --lab <lab-id> [--publish --reason \"...\"]");

  const kits = values.kit ? [values.kit] : [...EXPLORE_TARGETS.keys()];
  const selected: Array<{ kit: string; target: ExploreTarget }> = [];
  for (const kit of kits) {
    const load = EXPLORE_TARGETS.get(kit);
    if (!load) throw new Error(`Không có cấu hình Explore cho bàn ${kit}`);
    for (const target of await load()) {
      if (!values.lab || target.config.labId === values.lab) selected.push({ kit, target });
    }
  }
  if (!selected.length) throw new Error(`Không tìm thấy Lab ${values.lab ?? ""} trong bàn đã chọn`);

  const codes = catalogTopicCodes();
  const reason = values.reason ?? "Explore publish (owner, FL-26/INC-3 batch)";
  const requests = [];
  for (const { kit, target } of selected) {
    const labId = target.config.labId;
    const bench = EXPLORE_BENCHES[kit];
    const bench_check = bench.validate(target.config);
    const body = { config: target.config, topicCode: target.topicCode, reason };
    const schema = requestSchema(labId).safeParse(body);
    requests.push({
      labId,
      kit,
      method: "POST",
      path: `/admin/labs/${labId}/explore-versions`,
      topicCode: target.topicCode,
      topicInCatalog: codes ? codes.has(target.topicCode) : "catalog-not-found",
      benchValid: bench_check.ok,
      benchErrors: bench_check.ok ? [] : bench_check.errors,
      requestValid: schema.success,
      requestErrors: schema.success ? [] : schema.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      body,
    });
  }

  const outDir = values.out ?? resolve(tmpdir(), "nexalab-explore-dryrun");
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${values.lab ?? values.kit}-requests.json`);
  writeFileSync(outFile, JSON.stringify(requests, null, 2), "utf8");
  const summary = requests.map(({ body: _body, ...rest }) => rest);
  console.log(JSON.stringify({ mode: values.publish ? "publish-requested" : "dry-run", payloadFile: outFile, requests: summary }, null, 1));

  const blocked = requests.filter((r) => !r.benchValid || !r.requestValid || r.topicInCatalog === false);
  if (blocked.length) {
    console.error(`Blocked: ${blocked.map((r) => r.labId).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  if (!values.publish) return;

  const url = process.env.NEXALAB_ADMIN_API_URL;
  const token = process.env.NEXALAB_ADMIN_TOKEN;
  if (!url || !token) throw new Error("--publish cần NEXALAB_ADMIN_API_URL và NEXALAB_ADMIN_TOKEN; không gửi gì.");
  for (const request of requests) {
    const response = await fetch(`${url.replace(/\/$/, "")}${request.path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(request.body),
    });
    console.log(JSON.stringify({ labId: request.labId, status: response.status }));
    if (!response.ok) { process.exitCode = 1; return; }
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
