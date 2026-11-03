#!/usr/bin/env node
// Generate a CEO signature using OpenAI gpt-image-1.
//
// Usage:
//   node scripts/generate-signature.mjs --name="Example Person" --out="public/images/leads/example-workshop/signature.png"
//
// Reads OPENAI_API_KEY from .env.local in the project root.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const txt = fs.readFileSync(envPath, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  // Allow a bare key (no KEY= prefix) — first non-empty line.
  if (!process.env.OPENAI_API_KEY) {
    const firstLine = txt.split("\n").find((l) => l.trim() && !l.includes("="));
    if (firstLine && firstLine.startsWith("sk-")) {
      process.env.OPENAI_API_KEY = firstLine.trim();
    }
  }
}

async function main() {
  const { name, out } = parseArgs();
  if (!name || !out) {
    console.error("Usage: node scripts/generate-signature.mjs --name=\"Full Name\" --out=\"path/to/signature.png\"");
    process.exit(1);
  }

  loadEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY not found in .env.local");
    process.exit(1);
  }

  const outPath = path.isAbsolute(out) ? out : path.join(PROJECT_ROOT, out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const prompt =
    `A realistic, professional handwritten signature that says "${name}". ` +
    `Written in dark ink on a plain white background. Elegant, fluid, slightly cursive, ` +
    `suitable for a business CEO. High resolution, isolated on white, no other text or decoration.`;

  console.log(`Generating signature for "${name}"...`);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
    }),
  });
  const data = await res.json();
  if (data.error) {
    console.error("OpenAI error:", data.error.message);
    process.exit(1);
  }
  const item = data.data?.[0];
  if (!item) {
    console.error("No image returned:", JSON.stringify(data).slice(0, 500));
    process.exit(1);
  }

  if (item.b64_json) {
    fs.writeFileSync(outPath, Buffer.from(item.b64_json, "base64"));
  } else if (item.url) {
    const imgRes = await fetch(item.url);
    const buf = await imgRes.arrayBuffer();
    fs.writeFileSync(outPath, Buffer.from(buf));
  } else {
    console.error("Image response had no b64_json and no url.");
    process.exit(1);
  }

  console.log(`✓ Saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
