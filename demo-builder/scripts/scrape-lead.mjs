#!/usr/bin/env node
// Deterministic lead-website scraper. No AI tokens used.
//
// Given a slug + URL, this:
//   1. Fetches the homepage HTML
//   2. Extracts <title>, meta description, navigation links, contact info
//   3. Finds the company logo (icon, og:image, header img)
//   4. Collects all image URLs and ranks them by likely-hero quality
//   5. Downloads the logo + top 5 hero candidates into public/images/leads/<slug>/
//   6. Samples the logo's dominant non-white pixel to suggest a primaryColor
//   7. Writes leads/<slug>/raw.json with everything the Claude agent needs
//
// Usage:
//   node scripts/scrape-lead.mjs --slug=foo --url=https://business.example
//
// Output: leads/<slug>/raw.json
//         public/images/leads/<slug>/logo-original.<ext>
//         public/images/leads/<slug>/hero-candidate-{1..N}.<ext>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

// Build candidate URLs to try in order. `new URL()` normalises Finnish IDN
// hosts (ä/ö/å) to punycode for free; we also toggle the scheme and the www.
// prefix, since SMB sites often answer on only one combination.
function buildUrlVariants(rawUrl) {
  const bare = rawUrl.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const host = bare.split("/")[0];
  const hasWww = /^www\./i.test(host);
  const altWww = hasWww ? bare.replace(/^www\./i, "") : `www.${bare}`;
  const candidates = [
    `https://${bare}`,
    `https://${altWww}`,
    `http://${bare}`,
    `http://${altWww}`,
  ];
  const seen = new Set();
  const variants = [];
  for (const c of candidates) {
    try {
      const href = new URL(c).href; // punycode-normalised
      if (!seen.has(href)) { seen.add(href); variants.push(href); }
    } catch { /* skip unparseable variant */ }
  }
  return variants;
}

// Fetch the homepage, trying each URL variant until one returns usable HTML.
// Returns the URL that actually resolved (after redirects) so relative links
// and images downstream resolve against the real location.
async function fetchHomepage(rawUrl) {
  const variants = buildUrlVariants(rawUrl);
  let lastErr;
  for (const variant of variants) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(variant, {
        headers: { "User-Agent": UA },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!res.ok) { lastErr = new Error(`${res.status} ${res.statusText} for ${variant}`); continue; }
      const html = await res.text();
      if (html.trim().length > 200) return { html, finalUrl: res.url || variant };
      lastErr = new Error(`Body too short for ${variant}`);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Could not fetch ${rawUrl} (tried ${variants.length} variants). Last: ${lastErr?.message ?? "unknown"}`);
}

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

function absUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function extractMeta(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractAll(html, re) {
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function extractImageUrls(html, baseUrl) {
  const imgs = uniq([
    ...extractAll(html, /<img[^>]+src=["']([^"']+)["']/gi),
    ...extractAll(html, /<img[^>]+data-src=["']([^"']+)["']/gi),
    ...extractAll(html, /srcset=["']([^"']+)["']/gi).flatMap((s) =>
      s
        .split(",")
        .map((p) => p.trim().split(/\s+/)[0])
        .filter(Boolean)
    ),
    ...extractAll(html, /background-image:\s*url\(["']?([^"')]+)["']?\)/gi),
  ])
    .map((u) => absUrl(u, baseUrl))
    .filter(Boolean);
  return uniq(imgs);
}

function guessLogoUrl(html, baseUrl, candidates) {
  // Prefer og:image, apple-touch-icon, link rel=icon
  const og = extractMeta(html, "og:image");
  const apple = (html.match(
    /<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i
  ) || [])[1];
  const icon = (html.match(
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i
  ) || [])[1];

  const fromHeader = candidates.find((u) =>
    /logo|brand|header/i.test(decodeURIComponent(u))
  );

  return (
    fromHeader ||
    absUrl(og, baseUrl) ||
    absUrl(apple, baseUrl) ||
    absUrl(icon, baseUrl) ||
    null
  );
}

function scoreHero(url, idx) {
  // Higher = better. Penalize small thumbs and logos. Reward large, hero-ish keywords.
  const u = decodeURIComponent(url).toLowerCase();
  let score = 0;

  // Resolution hints in filename: 2048x..., 1920..., 1536...
  const sizeMatch = u.match(/(\d{3,4})x(\d{3,4})/);
  if (sizeMatch) {
    const w = parseInt(sizeMatch[1], 10);
    const h = parseInt(sizeMatch[2], 10);
    if (w >= 1500) score += 50;
    else if (w >= 1024) score += 30;
    else if (w >= 768) score += 10;
    if (w < 400 || h < 300) score -= 60;
  }

  // Filename hints — reward context photos, penalize catalog/placeholder content
  if (/hero|banner|cover|main|front|etusivu|piha|tehdas|kohde|tyokohde|referenssi/.test(u)) score += 20;
  if (/team|staff|porukka|henkilo|tiimi|crew|worker/.test(u)) score += 15;
  if (/logo|icon|favicon|brand|flag|sponsor/.test(u)) score -= 80;
  if (/thumb|150x|300x|small|mini/.test(u)) score -= 40;
  if (/\.svg$/.test(u)) score -= 50;
  if (/\.(gif)$/.test(u)) score -= 30;
  // Penalize product catalog shots (isolated products on white)
  if (/product|tuote|catalog|catalogue|shop|store|webshop|kauppa/.test(u)) score -= 30;
  // Penalize event/expo banners
  if (/expo|event|tapahtuma|messut|banner-ad|advertisement/.test(u)) score -= 40;

  // Earlier-in-page slight bonus
  score += Math.max(0, 10 - idx);

  return score;
}

function extractTextSnippet(html, limit = 4000) {
  // Crude: strip tags & scripts, collapse whitespace.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function extractContacts(text) {
  const phones = uniq(
    (text.match(/(?:\+?\d[\d\s\-()]{7,}\d)/g) || [])
      .map((s) => s.trim())
      .filter((s) => s.replace(/\D/g, "").length >= 7 && s.replace(/\D/g, "").length <= 15)
  ).slice(0, 8);
  const emails = uniq(
    (text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map((s) => s.toLowerCase())
  ).slice(0, 8);
  return { phones, emails };
}

function extractNavLinks(html, baseUrl) {
  const links = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (label && label.length > 1 && label.length < 40) {
      const u = absUrl(href, baseUrl);
      if (u && u.startsWith(baseUrl.replace(/\/$/, ""))) {
        links.push({ label, href: u });
      }
    }
  }
  // Dedup by label
  const seen = new Set();
  return links.filter((l) => {
    if (seen.has(l.label.toLowerCase())) return false;
    seen.add(l.label.toLowerCase());
    return true;
  }).slice(0, 20);
}

function fileExtFromUrl(url) {
  const clean = url.split("?")[0].split("#")[0];
  const ext = path.extname(clean).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) return ext;
  return ".jpg";
}

async function main() {
  const { slug, url } = parseArgs();
  if (!slug || !url) {
    console.error("Usage: node scripts/scrape-lead.mjs --slug=foo --url=https://business.example");
    process.exit(1);
  }

  const outDir = path.join(PROJECT_ROOT, "leads", slug);
  const imgDir = path.join(PROJECT_ROOT, "public", "images", "leads", slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(imgDir, { recursive: true });

  console.log(`Fetching ${url} ...`);
  const { html, finalUrl } = await fetchHomepage(url);
  const baseUrl = finalUrl.replace(/\/$/, "");
  if (baseUrl !== url.replace(/\/$/, "")) console.log(`  → resolved to ${baseUrl}`);

  const title = extractTitle(html);
  const description = extractMeta(html, "description") || extractMeta(html, "og:description");

  // Detect hosting-provider placeholder pages (Plesk, Apache default, etc.)
  const PLACEHOLDER_SIGNALS = [
    "plesk", "welcome to plesk", "apache2 ubuntu default",
    "default web page", "this site is under construction",
    "coming soon", "under construction", "cpanel",
  ];
  const textLower = html.toLowerCase();
  const isPlaceholder = PLACEHOLDER_SIGNALS.some((s) => textLower.includes(s));
  if (isPlaceholder) {
    console.warn("\n⚠️  PLACEHOLDER SITE DETECTED — this appears to be a hosting provider default page.");
    console.warn("   The company has no real website content at this URL.");
    console.warn("   → Skip logo (use company name fallback in nav)");
    console.warn("   → Use a tasteful picsum for heroImage");
    console.warn("   → Source all copy from the lead CSV / brief only\n");
  }
  const ogImage = extractMeta(html, "og:image");
  const themeColor = extractMeta(html, "theme-color");

  const allImages = extractImageUrls(html, baseUrl);
  const logoUrl = guessLogoUrl(html, baseUrl, allImages);

  const scored = allImages
    .filter((u) => u !== logoUrl)
    .map((u, i) => ({ url: u, score: scoreHero(u, i) }))
    .filter((x) => x.score > -30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const text = extractTextSnippet(html);
  const { phones, emails } = extractContacts(text);
  const navLinks = extractNavLinks(html, baseUrl);

  // Download logo
  let logoLocal = null;
  if (logoUrl) {
    try {
      const bytes = await fetchBytes(logoUrl);
      const ext = fileExtFromUrl(logoUrl);
      logoLocal = `/images/leads/${slug}/logo-original${ext}`;
      fs.writeFileSync(path.join(imgDir, `logo-original${ext}`), bytes);
      console.log(`  ✓ logo (${bytes.length} bytes)`);
    } catch (e) {
      console.warn(`  ! logo download failed: ${e.message}`);
    }
  }

  // Download top hero candidates
  const heroCandidates = [];
  for (let i = 0; i < Math.min(5, scored.length); i++) {
    const { url: imgUrl } = scored[i];
    try {
      const bytes = await fetchBytes(imgUrl);
      const ext = fileExtFromUrl(imgUrl);
      const local = `/images/leads/${slug}/hero-candidate-${i + 1}${ext}`;
      fs.writeFileSync(path.join(imgDir, `hero-candidate-${i + 1}${ext}`), bytes);
      heroCandidates.push({
        url: imgUrl,
        local,
        bytes: bytes.length,
        score: scored[i].score,
      });
      console.log(`  ✓ hero-candidate-${i + 1} (${(bytes.length / 1024).toFixed(0)}KB)`);
    } catch (e) {
      console.warn(`  ! hero ${i + 1} failed: ${e.message}`);
    }
  }

  const raw = {
    slug,
    sourceUrl: baseUrl,
    scrapedAt: new Date().toISOString(),
    isPlaceholderSite: isPlaceholder,
    title,
    description,
    themeColor,
    ogImage,
    logo: { sourceUrl: logoUrl, local: logoLocal },
    heroCandidates,
    contacts: { phones, emails },
    navLinks,
    rawTextSnippet: text.slice(0, 2000),
  };

  fs.writeFileSync(path.join(outDir, "raw.json"), JSON.stringify(raw, null, 2));
  console.log(`\n✓ Wrote leads/${slug}/raw.json`);
  console.log(`  ${heroCandidates.length} hero candidates downloaded`);
  console.log(`  Logo: ${logoLocal ?? "NOT FOUND"}`);
  console.log(`  Phones: ${phones.slice(0, 3).join(", ") || "—"}`);
  console.log(`  Emails: ${emails.slice(0, 3).join(", ") || "—"}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
