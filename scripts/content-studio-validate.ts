import { readFileSync } from "node:fs";
import { validateContentStudioBlueprint } from "../src/modules/labs/application/content-studio-validation";

try {
  const result = validateContentStudioBlueprint(JSON.parse(readFileSync(0, "utf8")));
  process.stdout.write(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 2;
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, errors: [error instanceof Error ? error.message : "Invalid blueprint"], golden: [] }));
  process.exitCode = 2;
}
