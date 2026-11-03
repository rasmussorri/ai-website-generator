// Development-only smoke checks and screenshots. Never uses .env.local values.
// Rebuilds with synthetic configuration; run npm run build with your own config
// again before deploying an actual installation.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer";
import sharp from "sharp";
import GIFEncoder from "gif-encoder-2";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = resolve(appDir, "..");
const origin = "http://127.0.0.1:4317";
const backend = "http://127.0.0.1:4318";
const rows = JSON.parse(readFileSync(resolve(repoDir, "examples/portfolio-leads.json"), "utf8"));
for (const row of rows) {
  if (row.demo_url) row.demo_url = row.demo_url.replace("http://localhost:3000", origin);
}

// Keep secrets from the invoking shell and .env.local out of the child server.
const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "SystemRoot"]
  .filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
for (const match of readFileSync(resolve(appDir, ".env.example"), "utf8").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) {
  env[match[1]] = "";
}
Object.assign(env, {
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: backend,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "portfolio-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "portfolio-placeholder",
  NEXT_PUBLIC_DEMO_BASE_URL: origin,
  REVALIDATE_SECRET: "portfolio-fixture-revalidation",
  CRON_SECRET: "portfolio-fixture-cron",
});

const tables = {
  leads: rows,
  sms_messages: [],
  sms_suppression: [],
  email_suppression: [],
  sms_compliance_log: [],
  email_compliance_log: [],
};
let trackedOpens = 0;

function matches(row, key, expression) {
  const dot = expression.indexOf(".");
  const op = expression.slice(0, dot);
  const value = expression.slice(dot + 1);
  if (op === "eq") return String(row[key]) === value;
  if (op === "is") return value === "null" ? row[key] == null : String(row[key]) === value;
  if (op === "not") return !matches(row, key, value);
  if (op === "lt") return row[key] != null && String(row[key]) < value;
  if (op === "in") return value.slice(1, -1).split(",").includes(String(row[key]));
  throw new Error(`Unsupported fixture filter: ${op}`);
}

// Tiny fixture implementation of the REST queries exercised by these checks.
// It is loopback-only, contains synthetic records, and is never deployed.
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, backend);
    const table = url.pathname.split("/").at(-1);
    if (url.pathname === "/rest/v1/rpc/record_demo_open") {
      trackedOpens += 1;
      res.writeHead(204).end();
      return;
    }
    if (!(table in tables)) {
      res.writeHead(404).end();
      return;
    }
    let result = tables[table].filter((row) => {
      for (const [key, value] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(key)) continue;
        if (key === "or") {
          const clauses = value.slice(1, -1).split(",");
          if (!clauses.some((clause) => {
            const dot = clause.indexOf(".");
            return matches(row, clause.slice(0, dot), clause.slice(dot + 1));
          })) return false;
        } else if (!matches(row, key, value)) return false;
      }
      return true;
    });
    if (req.method === "PATCH") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const patch = JSON.parse(raw);
      for (const row of result) Object.assign(row, patch);
    } else if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (url.searchParams.has("limit")) result = result.slice(0, Number(url.searchParams.get("limit")));
    const single = req.headers.accept?.includes("vnd.pgrst.object+json");
    res.setHeader("Content-Type", "application/json");
    if (single && result.length !== 1) {
      res.writeHead(406).end(JSON.stringify({ code: "PGRST116", details: `The result contains ${result.length} rows` }));
    } else {
      res.end(JSON.stringify(single ? result[0] : result));
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500).end(JSON.stringify({ error: "Fixture query failed" }));
  }
});

function run(args, childEnv = env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { cwd: appDir, env: childEnv, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`Command exited ${code}`)));
  });
}

const nextBin = resolve(appDir, "node_modules/next/dist/bin/next");
let child;
let browser;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function start(deployed = false) {
  child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", "4317"], {
    cwd: appDir, env: { ...env, ...(deployed ? { VERCEL: "1", TWILIO_AUTH_TOKEN: "portfolio-fixture-signing" } : {}) }, stdio: "inherit",
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) throw new Error("Fixture app exited before becoming ready");
    try { await fetch(`${origin}/images/examples/workshop.svg`); return; } catch { await pause(200); }
  }
  throw new Error("Fixture app did not become ready");
}

async function stop() {
  if (!child || child.exitCode != null) return;
  const stopped = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  await stopped;
}

async function status(path, expected, options) {
  const response = await fetch(`${origin}${path}`, options);
  assert.equal(response.status, expected, `${options?.method ?? "GET"} ${path}`);
  return response;
}

try {
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(4318, "127.0.0.1", done);
  });
  await run([nextBin, "build"]);
  await start();
  assert.equal((await (await status("/api/leads", 200)).json()).length, 8);
  const queue = await (await status("/api/outreach/queue", 200)).json();
  assert.equal(queue.sendMode, "dry-run");
  assert.equal(queue.leads.length, 0, "Blank fictional phones must not enter the SMS queue");
  const email = await (await status("/api/outreach/email/leads", 200)).json();
  assert.equal(email.leads.length, 3);
  assert.ok(email.leads.every((lead) => lead.contactEmail.endsWith(".example")));
  await status("/api/outreach/email/approve", 500, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: rows[0].id }),
  });
  assert.equal(rows[0].email_status, null, "Missing sending config must preserve queue state");
  await status("/missing-demo", 404);
  await status("/api/git-updates", 404);

  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    const allowed = ["127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)
      || ["data:", "about:"].includes(url.protocol);
    if (allowed) void request.continue(); else void request.abort();
  });
  const screenshots = resolve(repoDir, "docs/screenshots");
  mkdirSync(screenshots, { recursive: true });
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.goto(`${origin}/dashboard`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Northstar Workshop"));
  await page.screenshot({ path: resolve(screenshots, "dashboard.png"), fullPage: true });
  await page.type('input[placeholder="Search leads…"]', "Birchline");
  await page.waitForFunction(() => document.body.innerText.includes("1 of 5"));

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/northstar-workshop#staff-preview`, { waitUntil: "networkidle0" });
  await page.waitForSelector("h1");
  await pause(1800);
  await page.screenshot({ path: resolve(screenshots, "generated-site.png") });
  assert.equal(await page.$('a[href="tel:"]'), null, "Blank phones must not produce empty call buttons");
  const encoder = new GIFEncoder(640, 444, "neuquant");
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(900);
  encoder.setQuality(10);
  for (const scrollY of [0, 500, 1000, 500, 0]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), scrollY);
    await pause(500);
    const frame = await sharp(await page.screenshot()).resize(640, 444).ensureAlpha().raw().toBuffer();
    encoder.addFrame(frame);
  }
  encoder.finish();
  writeFileSync(resolve(appDir, "public/images/examples/demo-preview.gif"), encoder.out.getData());
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Demo must fit a mobile viewport");

  await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/dashboard/outreach/email`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Northstar Workshop"));
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: resolve(screenshots, "outreach.png"), fullPage: true });
  assert.deepEqual(errors, [], "Browser must not have uncaught errors");
  await browser.close();
  browser = null;
  await stop();

  await start(true);
  for (const path of ["/", "/dashboard", "/dashboard/outreach/email", "/api/leads", "/api/outreach/queue"]) await status(path, 404);
  await status("/api/generate-demo", 404, { method: "POST" });
  await status("/northstar-workshop", 200);
  await status("/api/revalidate?path=/northstar-workshop", 401);
  await status(`/api/revalidate?path=/northstar-workshop&secret=${env.REVALIDATE_SECRET}`, 200);
  await status("/api/cron/cleanup-demos", 401);
  const cleanup = await (await status("/api/cron/cleanup-demos", 200, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })).json();
  assert.equal(cleanup.count, 0);
  await status("/api/sms/inbound", 403, { method: "POST", body: new URLSearchParams({ Body: "stop" }) });
  await status("/api/track-open?slug=northstar-workshop", 204, { method: "POST", headers: { "User-Agent": "Portfolio verification" } });
  assert.equal(trackedOpens, 1);
  console.log("Portfolio checks passed: fixtures, dashboard search, desktop/mobile demo, email preview, route gates, signature rejection, tracking, and screenshots.");
} finally {
  if (browser) await browser.close();
  await stop();
  await new Promise((done) => server.close(done));
}
