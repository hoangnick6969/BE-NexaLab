// Lists every route with its HTTP method, full path, handler and auth metadata, sorted. Usage: tsx route-manifest.ts <src dir>
import "reflect-metadata";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
const PATH = "path",
  METHOD = "method";
const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD"];
const root = path.resolve(process.argv[2]);
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f) && f !== "main.ts") files.push(p);
  }
};
walk(root);
(async () => {
  const lines: string[] = [];
  for (const file of files) {
    const mod = await import(file);
    for (const value of Object.values(mod)) {
      if (
        typeof value !== "function" ||
        Reflect.getMetadata(PATH, value) === undefined ||
        (!Reflect.getMetadata("__controller__", value) && Reflect.getMetadata(PATH, value) === undefined)
      )
        continue;
      const base = Reflect.getMetadata(PATH, value);
      if (typeof base !== "string") continue;
      const classPublic = Reflect.getMetadata("public", value),
        classRoles = Reflect.getMetadata("roles", value);
      for (const name of Object.getOwnPropertyNames((value as any).prototype)) {
        const handler = (value as any).prototype[name];
        if (typeof handler !== "function") continue;
        const sub = Reflect.getMetadata(PATH, handler),
          m = Reflect.getMetadata(METHOD, handler);
        if (sub === undefined || m === undefined) continue;
        const full =
          "/" +
          [base, sub]
            .filter((x) => x && x !== "/")
            .join("/")
            .replace(/\/+/g, "/")
            .replace(/^\//, "");
        const pub = Reflect.getMetadata("public", handler) ?? classPublic ?? false;
        const roles = Reflect.getMetadata("roles", handler) ?? classRoles ?? [];
        const params = Reflect.getMetadata("__routeArguments__", value as any, name)
          ? Object.keys(Reflect.getMetadata("__routeArguments__", value, name)).length
          : 0;
        lines.push(`${methods[m]} ${full} public=${pub} roles=${[...roles].sort().join(",")} args=${params} handler=${name}`);
      }
    }
  }
  console.log(lines.sort().join("\n"));
  process.exit(0);
})();
