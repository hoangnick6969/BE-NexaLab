// A5-T5 live recovery gate. The API is started behind a TCP proxy to the
// configured PostgreSQL database; the proxy is then stopped and restarted so
// the test exercises a real broken database connection rather than an HTTP mock.
import "dotenv/config";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const sourceUrl = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["postgres:", "postgresql:"].includes(sourceUrl.protocol), "DATABASE_URL must point to PostgreSQL");
assert.ok(process.env.JWT_SECRET?.length >= 32, "JWT_SECRET must contain at least 32 characters");
assert.ok(process.env.SEED_PASSWORD, "SEED_PASSWORD is required for the seeded recovery journey");

const upstreamPort = Number(sourceUrl.port || 5432);
const sockets = new Set();
let proxy;
let api;

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => server.listen(0, "127.0.0.1", resolveListen).once("error", reject));
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function startProxy(port = 0) {
  proxy = net.createServer((downstream) => {
    const upstream = net.connect({ host: sourceUrl.hostname, port: upstreamPort });
    sockets.add(downstream);
    sockets.add(upstream);
    const closeBoth = () => {
      downstream.destroy();
      upstream.destroy();
      sockets.delete(downstream);
      sockets.delete(upstream);
    };
    downstream.on("error", closeBoth).on("close", () => sockets.delete(downstream));
    upstream.on("error", closeBoth).on("close", () => sockets.delete(upstream));
    downstream.pipe(upstream).pipe(downstream);
  });
  await new Promise((resolveListen, reject) => proxy.listen(port, "127.0.0.1", resolveListen).once("error", reject));
  return proxy.address().port;
}

async function stopProxy() {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  if (proxy?.listening) await new Promise((resolveClose) => proxy.close(resolveClose));
}

async function waitFor(url, predicate, attempts = 40, init = {}) {
  let last;
  for (let index = 0; index < attempts; index++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(3000) });
      if (predicate(response)) return response;
      last = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw last ?? new Error("service did not become ready");
}

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  return { response, body: await response.json() };
}

try {
  const proxyPort = await startProxy();
  const apiPort = await availablePort();
  const proxiedUrl = new URL(sourceUrl);
  proxiedUrl.hostname = "127.0.0.1";
  proxiedUrl.port = String(proxyPort);
  proxiedUrl.searchParams.set("connect_timeout", "2");
  const apiOrigin = `http://127.0.0.1:${apiPort}/api`;
  const tsxCli = resolve("node_modules", "tsx", "dist", "cli.mjs");
  const logs = [];
  api = spawn(process.execPath, [tsxCli, "src/main.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: proxiedUrl.toString(), PORT: String(apiPort), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [api.stdout, api.stderr])
    stream.on("data", (chunk) => {
      logs.push(String(chunk));
      if (logs.length > 20) logs.shift();
    });

  await waitFor(`${apiOrigin}/health`, (response) => response.status === 200);
  const login = await jsonRequest(`${apiOrigin}/auth/student/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: process.env.SEED_STUDENT_USERNAME ?? "nguyenan.8a",
      password: process.env.SEED_PASSWORD,
    }),
  });
  assert.equal(login.response.status, 201, "seeded student login must succeed before the interruption");
  const headers = { authorization: `Bearer ${login.body.accessToken}` };
  assert.equal((await fetch(`${apiOrigin}/me/progress`, { headers })).status, 200, "progress must be healthy before interruption");

  await stopProxy();
  const interrupted = await jsonRequest(`${apiOrigin}/me/progress`, { headers });
  assert.equal(interrupted.response.status, 500, "database interruption must reach the real API as a controlled 500");
  assert.deepEqual(interrupted.body, { message: "Lỗi hệ thống" }, "database details must not leak to the client");

  await startProxy(proxyPort);
  await waitFor(`${apiOrigin}/me/progress`, (response) => response.status === 200, 60, { headers });
  console.log("PASS real PostgreSQL interruption returns a private system error");
  console.log("PASS API reconnects and serves official progress after PostgreSQL recovery");
} catch (error) {
  if (api && logs.length) process.stderr.write(logs.slice(-5).join(""));
  throw error;
} finally {
  await stopProxy();
  if (api && !api.killed) api.kill();
}
