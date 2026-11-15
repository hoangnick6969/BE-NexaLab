// Owner path for publishing the K2 Explore Labs (FL-13, FL-14a) to any database, including the shared one:
// Admin API only (POST /admin/labs/:id/explore-versions), never a direct DB write. Read-only unless --apply.
//   NEXALAB_API=https://.../api NEXALAB_ADMIN_PASSWORD=... npx tsx scripts/publish-k2-explore.ts [--apply] [--lab <labId> | --all]
import "dotenv/config";
import { loadK2ExploreTargets } from "./k2-explore-targets";

const api = (process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api").replace(/\/$/, "");
const apply = process.argv.includes("--apply");
const onlyLab = process.argv.includes("--lab") ? process.argv[process.argv.indexOf("--lab") + 1] : undefined;
if (apply && !onlyLab && !process.argv.includes("--all")) throw new Error("With --apply, name one Lab (--lab <labId>) or pass --all: several K2 Labs are listed and each publish is a write to the database.");
const password = process.env.NEXALAB_ADMIN_PASSWORD;
if (!password) throw new Error("Set NEXALAB_ADMIN_PASSWORD; this script never stores or prints credentials.");
let token: string | undefined;

async function call(path: string, method = "GET", body?: unknown) {
  const response = await fetch(api + path, {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const targets = await loadK2ExploreTargets();
  token = (await call("/auth/admin/login", "POST", { email: process.env.NEXALAB_ADMIN_EMAIL ?? "admin@nexalab.local", password })).accessToken;
  if (!token) throw new Error("Admin login returned no token");
  const labs: Array<{ id: string; status: string; scope: string; config: unknown }> = await call("/admin/labs");
  for (const { config, topicCode } of targets) {
    if (onlyLab && config.labId !== onlyLab) continue;
    const current = labs.find((lab) => lab.id === config.labId);
    console.log(JSON.stringify({ api, labId: config.labId, topicCode, current: current ? { status: current.status, scope: current.scope, config: current.config } : null }));
    if (!apply) continue;
    const result = await call(`/admin/labs/${config.labId}/explore-versions`, "POST", { config, topicCode, reason: "Owner publishes the pinned K2 Explore config (P0 C1.3)" });
    console.log(JSON.stringify({ published: result }));
  }
  if (!apply) console.log("Read-only preflight passed. Use --apply to publish through the Admin API.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
