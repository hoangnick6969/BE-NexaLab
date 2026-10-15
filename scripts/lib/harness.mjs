// Shared real-dependency harness for Increment B/C journeys (B0P-T3).
// Identities and URLs come from the environment; nothing here logs in with a
// mock or a committed credential. Each run prints the dependencies it used
// and the evidence tier, and a failure before the journey starts is reported
// as SETUP FAILURE, never as a product result.
//   TEST_API      API base (default http://127.0.0.1:4000/api)
//   TEST_WEB      browser base, when the journey drives a browser
//   DATABASE_URL  database the API uses (read by Prisma)
//   EVIDENCE_TIER optional explicit tier: pilot | production (needs APP_ENV to match)
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Tier of the evidence this run produces; local checks never claim pilot or production. */
export function evidenceTier(env = process.env) {
  const host = databaseHost(env);
  if (env.EVIDENCE_TIER && ["pilot", "production"].includes(env.EVIDENCE_TIER)) {
    if (env.APP_ENV !== env.EVIDENCE_TIER || LOCAL_HOSTS.has(host))
      throw new Error(`EVIDENCE_TIER=${env.EVIDENCE_TIER} requires APP_ENV=${env.EVIDENCE_TIER} and a non-local database`);
    return env.EVIDENCE_TIER;
  }
  return LOCAL_HOSTS.has(host) ? "local-runtime" : "shared-development";
}

export function databaseHost(env = process.env) {
  try {
    return new URL(env.DATABASE_URL ?? "").hostname || "unknown";
  } catch {
    return "unknown";
  }
}

export function createHarness(name, { browser = false } = {}) {
  const origin = process.env.TEST_API ?? "http://127.0.0.1:4000/api";
  const db = new PrismaClient();
  let passed = 0;
  let setupComplete = false;
  const skipped = [];

  async function req(path, method = "GET", body, auth, headers = {}, base = origin) {
    const response = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer " + auth } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, data };
  }
  function check(label, condition, detail) {
    assert.ok(condition, label + (detail === undefined ? "" : " — " + JSON.stringify(detail)));
    passed++;
    console.log("PASS " + label);
  }
  function skip(label, reason) {
    skipped.push(label);
    console.log(`SKIP ${label}: ${reason}`);
  }
  const envelope = (res, status, code) =>
    res.status === status && res.data?.statusCode === status && res.data?.code === code && typeof res.data?.message === "string";
  const key = () => ({ "Idempotency-Key": randomUUID() });

  function dependencies(apiVersion) {
    return {
      api: `${origin} (version ${apiVersion ?? "unknown"})`,
      database: databaseHost(),
      browser: browser ? (process.env.TEST_WEB ?? "http://127.0.0.1:5173") : "not exercised",
      tier: evidenceTier(),
    };
  }

  /** Runs setup then the journey; cleanup always runs. Exit code 1 on any failure. */
  async function run({ setup, journey, cleanup }) {
    let deps;
    try {
      const health = await req("/health");
      assert.equal(health.status, 200, "API health");
      deps = dependencies(health.data?.version);
      console.log(`${name} — API ${deps.api} · database ${deps.database} · browser ${deps.browser} · tier ${deps.tier}`);
      const context = setup ? await setup() : {};
      setupComplete = true;
      await journey(context);
      console.log(
        `\n${name}: ${passed} checks passed${skipped.length ? `, ${skipped.length} skipped (${skipped.join("; ")})` : ""}. ` +
          `Evidence tier: ${deps.tier} (API + database ${deps.database}${browser ? " + browser" : ""}).`,
      );
    } catch (error) {
      console.error(setupComplete ? "PRODUCT FAILURE" : "SETUP FAILURE (not a product result)");
      console.error(error?.message ?? error);
      process.exitCode = 1;
    } finally {
      try {
        if (cleanup) await cleanup();
      } finally {
        await db.$disconnect();
      }
    }
  }

  return { origin, db, req, check, skip, envelope, key, run, passed: () => passed };
}
