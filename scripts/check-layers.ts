// Enforces the backend layer rules (docs/architecture/project-structure.md):
//   1. application never imports interface or infrastructure (it depends on ports, not adapters);
//   2. infrastructure never imports interface;
//   3. a module never reaches into another module's interface or infrastructure (only its application);
//   4. common, config and db never import from modules;
//   5. every constructor parameter of a Nest class uses @Inject(...): the tsx dev runtime emits no decorator
//      metadata, so an unannotated parameter is undefined at runtime even though tsc and Vitest pass.
// Exceptions are listed below with a reason; anything else fails.
//   npm run check:layers
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";

const SRC = join(__dirname, "..", "src");
// The JWT guard and public user shape are cross-cutting HTTP concerns that live with auth's interface.
const SHARED_INTERFACE = new Set(["modules/auth/interface/auth.ts"]);
// Process-wide storage singleton used by several modules' application code.
const SHARED_INFRASTRUCTURE = new Set(["modules/storage/infrastructure/storage.ts", "modules/mail/infrastructure/mail.ts"]);
// Known debts: application code that still reaches an adapter directly. Remove entries as they are fixed.
const ALLOWED_DEBT = new Set<string>([]);

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) files.push(full);
  }
};
walk(SRC);

type Place = { area: string; module?: string; layer?: string };
const place = (rel: string): Place => {
  const parts = rel.split("/");
  if (parts[0] !== "modules") return { area: parts.length > 1 ? parts[0] : "root" };
  return { area: "modules", module: parts[1], layer: parts.length > 3 ? parts[2] : "module" };
};

const problems: string[] = [];
const resolveImport = (from: string, spec: string) => {
  for (const ext of [".ts", "/index.ts", ""]) {
    const candidate = normalize(join(dirname(from), spec + ext));
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* try the next extension */
    }
  }
  return null;
};

for (const file of files) {
  const rel = relative(SRC, file).split(sep).join("/");
  const me = place(rel);
  const source = readFileSync(file, "utf8");
  if (/@(Injectable|Controller)\(/.test(source))
    for (const ctor of source.matchAll(/constructor\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g))
      for (const param of ctor[1].split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean))
        if (param.includes(":") && !param.includes("@Inject(")) problems.push(`constructor parameter without @Inject: ${rel} (${param})`);
  for (const match of readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = resolveImport(file, match[1]);
    if (!target) continue;
    const trel = relative(SRC, target).split(sep).join("/");
    if (ALLOWED_DEBT.has(`${rel} -> ${trel}`)) continue;
    const them = place(trel);
    const say = (rule: string) => problems.push(`${rule}: ${rel} -> ${trel}`);
    if (["common", "config", "db"].includes(me.area) && them.area === "modules" && !SHARED_INFRASTRUCTURE.has(trel)) say("shared code imports a module");
    if (me.area !== "modules" || them.area !== "modules") continue;
    if (me.layer === "application" && them.layer === "interface" && !SHARED_INTERFACE.has(trel)) say("application imports interface");
    if (me.layer === "application" && them.layer === "infrastructure" && !SHARED_INFRASTRUCTURE.has(trel)) say("application imports infrastructure");
    if (me.layer === "infrastructure" && them.layer === "interface" && !SHARED_INTERFACE.has(trel)) say("infrastructure imports interface");
    if (me.module !== them.module && (them.layer === "interface" || them.layer === "infrastructure") && !SHARED_INTERFACE.has(trel) && !SHARED_INFRASTRUCTURE.has(trel))
      say(`reaches into ${them.module}/${them.layer}`);
  }
}

if (problems.length) {
  console.log(problems.sort().join("\n"));
  console.log(`\n${problems.length} layer violation(s)`);
  process.exitCode = 1;
} else console.log(`layers ok (${files.length} files)`);
