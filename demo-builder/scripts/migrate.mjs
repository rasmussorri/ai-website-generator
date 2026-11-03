#!/usr/bin/env node
// ─── Migration runner ──────────────────────────────────────────────────────────
// Applies every SQL file in supabase/migrations/ that hasn't run yet, in
// filename order, recording each in a `schema_migrations` table so it never
// runs twice. Replaces the old "copy-paste into the Supabase SQL editor" step.
//
//   npm run migrate          apply all pending migrations
//   npm run migrate status   list applied vs pending, change nothing
//
// Needs SUPABASE_DB_URL in .env.local — the Postgres connection string from
// Supabase → Project Settings → Database → Connection string (URI). Use the
// direct connection (port 5432) so DDL runs in a real session.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

// Minimal .env.local loader so the script works regardless of how it's invoked
// (no dotenv dependency, no reliance on a specific Node --env-file version).
function loadEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 0001_, 0002_, … sort lexicographically in order
}

async function main() {
  loadEnv();
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      "✗ SUPABASE_DB_URL is not set.\n" +
        "  Add it to .env.local — copy it from Supabase → Project Settings →\n" +
        "  Database → Connection string (URI), direct connection (port 5432).",
    );
    process.exit(1);
  }

  const statusOnly = process.argv[2] === "status";

  const client = new pg.Client({
    connectionString,
    // Supabase requires TLS; it presents a cert chain Node won't verify by default.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.version));
    const all = migrationFiles();
    const pending = all.filter((f) => !applied.has(f));

    if (statusOnly) {
      console.log("Migrations:");
      for (const f of all) console.log(`  ${applied.has(f) ? "✓ applied" : "· pending"}  ${f}`);
      console.log(`\n${applied.size} applied · ${pending.length} pending`);
      return;
    }

    if (pending.length === 0) {
      console.log("✓ Database is up to date — no pending migrations.");
      return;
    }

    console.log(`Applying ${pending.length} migration(s)…\n`);
    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`  → ${file} … `);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log("done");
      } catch (err) {
        await client.query("ROLLBACK");
        console.log("FAILED");
        console.error(`\n✗ ${file} failed and was rolled back:\n${err.message}`);
        process.exit(1);
      }
    }
    console.log("\n✓ All migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
