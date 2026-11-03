import { NextRequest } from "next/server";
import { BRAND } from "@/lib/brand";
import puppeteer, { type Browser } from "puppeteer";
import { generateText, generateTextFromImage } from "@/lib/ai";

export const runtime = "nodejs";

// Text scores in this inclusive band are ambiguous from HTML alone, so we take
// a screenshot and let a vision model judge how the site actually looks.
const VISION_BAND_MIN = 30;
const VISION_BAND_MAX = 69;

interface LeadInput {
  id: string;
  url: string;
  companyName: string;
}

function normalizeUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

// Build candidate URLs to try in order. `new URL()` normalises Finnish IDN
// hosts (ä/ö/å) to punycode for free; we additionally toggle the scheme and
// the www. prefix, since SMB sites often only answer on one combination.
function buildUrlVariants(rawUrl: string): string[] {
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

  const seen = new Set<string>();
  const variants: string[] = [];
  for (const c of candidates) {
    try {
      const href = new URL(c).href; // punycode-normalised
      if (!seen.has(href)) {
        seen.add(href);
        variants.push(href);
      }
    } catch {
      /* skip unparseable variant */
    }
  }
  return variants;
}

// Try each variant until one returns usable HTML. Returns the final URL after
// redirects so HTTPS/flag detection reflects where the site actually resolves.
async function fetchHtml(rawUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  for (const variant of buildUrlVariants(rawUrl)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      const res = await fetch(variant, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SiteQualityChecker/1.0)" },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const raw = await res.text();
      if (raw.trim().length > 200) {
        return { html: raw.slice(0, 100_000), finalUrl: res.url || variant };
      }
    } catch {
      /* try next variant */
    }
  }
  return null;
}

function extractSignals(html: string, url: string): string {
  const lines: string[] = [];

  lines.push(`HTTPS: ${url.startsWith("https://")}`);

  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  lines.push(`Mobile responsive (viewport meta): ${hasViewport}`);

  // CMS / framework detection
  const isWP = html.includes("/wp-content/") || html.includes("wp-includes");
  const wpVer = html.match(/content=["']WordPress\s*([\d.]+)/i)?.[1];
  const isWix = html.includes("wixsite.com") || html.toLowerCase().includes("_wix_") || html.includes("parastorage.com");
  const isJimdo = html.toLowerCase().includes("jimdo.com") || html.includes("jimdosite.com");
  const isKotisivukone = html.toLowerCase().includes("kotisivukone");
  const isWebflow = html.includes("webflow.com");
  const isShopify = html.includes("cdn.shopify.com");
  const isNext = html.includes("__NEXT_DATA__") || html.includes('id="__next"');
  const isNuxt = html.includes("__nuxt") || html.includes("/_nuxt/");
  const isReact = html.includes("data-reactroot") || html.includes("data-reactid");

  if (isWP) lines.push(`CMS: WordPress${wpVer ? ` ${wpVer}` : ""}`);
  else if (isWix) lines.push("CMS: Wix (site builder)");
  else if (isJimdo) lines.push("CMS: Jimdo (site builder)");
  else if (isKotisivukone) lines.push("CMS: Kotisivukone (Finnish site builder)");
  else if (isWebflow) lines.push("CMS: Webflow");
  else if (isShopify) lines.push("Platform: Shopify (e-commerce)");
  else if (isNext) lines.push("Framework: Next.js (modern)");
  else if (isNuxt) lines.push("Framework: Nuxt.js (modern)");
  else if (isReact) lines.push("Framework: React (modern)");
  else lines.push("CMS: Unknown/custom HTML");

  // Copyright year
  const copyrightMatch = html.match(/©\s*(20\d\d)|[Cc]opyright\s*(?:©\s*)?(20\d\d)/);
  if (copyrightMatch) {
    lines.push(`Copyright year: ${copyrightMatch[1] ?? copyrightMatch[2]}`);
  }

  // Meta description
  const metaDescA = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,})/i);
  const metaDescB = html.match(/<meta[^>]+content=["']([^"']{10,})[^>]+name=["']description["']/i);
  const metaDesc = metaDescA?.[1] ?? metaDescB?.[1];
  if (metaDesc) {
    lines.push(`Meta description: "${metaDesc.trim().slice(0, 120)}"`);
  } else {
    lines.push("Meta description: missing");
  }

  // Page title
  const titleMatch = html.match(/<title[^>]*>([^<]{1,120})/i);
  if (titleMatch) lines.push(`Page title: "${titleMatch[1].trim()}"`);

  // Schema.org
  lines.push(`Schema.org structured data: ${html.includes("schema.org")}`);

  // Rough body text length
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  lines.push(`Body text length: ~${Math.round(stripped.length / 100) * 100} chars`);

  return lines.join("\n");
}

function extractFlags(html: string, url: string): string[] {
  const flags: string[] = [];
  if (!url.startsWith("https://")) flags.push("No HTTPS");
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) flags.push("Not mobile responsive");

  const isWP = html.includes("/wp-content/") || html.includes("wp-includes");
  const wpVer = html.match(/content=["']WordPress\s*([\d.]+)/i)?.[1];
  if (isWP && wpVer) {
    const major = parseInt(wpVer.split(".")[0], 10);
    if (major < 6) flags.push("Outdated WordPress");
    else flags.push("WordPress");
  } else if (isWP) {
    flags.push("WordPress");
  }

  if (html.includes("wixsite.com") || html.toLowerCase().includes("_wix_") || html.includes("parastorage.com"))
    flags.push("Wix");
  if (html.toLowerCase().includes("jimdo.com") || html.includes("jimdosite.com"))
    flags.push("Jimdo");
  if (html.toLowerCase().includes("kotisivukone"))
    flags.push("Kotisivukone");

  const metaDescA = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,})/i);
  const metaDescB = html.match(/<meta[^>]+content=["']([^"']{10,})[^>]+name=["']description["']/i);
  if (!metaDescA && !metaDescB) flags.push("No meta description");

  if (!html.includes("schema.org")) flags.push("No schema.org");

  return flags;
}

// Pull a 0-100 score + reason out of a model reply. Tolerant of stray prose:
// slices the outer JSON object, then falls back to the first integer found.
function parseScore(text: string): { score: number; reason: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let parsed: { score?: unknown; reason?: unknown } = {};
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      /* fall through to regex fallback */
    }
  }
  let score = Number(parsed.score);
  if (!Number.isFinite(score)) {
    const m = text.match(/\d{1,3}/);
    score = m ? Number(m[0]) : NaN;
  }
  if (!Number.isFinite(score)) return null;
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}

// Capture an above-the-fold homepage screenshot as base64 JPEG. Returns null on
// any failure so the caller can fall back to the text-only score.
async function captureScreenshot(browser: Browser, url: string): Promise<string | null> {
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15_000 });
    const buf = await page.screenshot({ type: "jpeg", quality: 70 });
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function analyzeOneLead(
  lead: LeadInput,
  screenshot: (url: string) => Promise<string | null>,
): Promise<{ score: number; reason: string; flags: string[] }> {
  const fetched = await fetchHtml(lead.url);
  const html = fetched?.html ?? "";
  const finalUrl = fetched?.finalUrl ?? normalizeUrl(lead.url);

  const flags = html ? extractFlags(html, finalUrl) : ["Site unreachable"];

  const signals = html
    ? extractSignals(html, finalUrl)
    : `URL: ${normalizeUrl(lead.url)}\nFetch failed after trying https/http and www variants (site down, blocking bots, or no site at all)`;

  const prompt = `You help a Finnish web design agency (${BRAND.agencyName}) decide which SMB leads are worth pitching a website redesign to.

Website signals for "${lead.companyName}":
${signals}

Score 0-100 how much this site needs a redesign (higher = stronger lead for us):
- 90-100: severely outdated, broken, placeholder, or unreachable — prime redesign lead
- 60-89: dated site-builder or old WordPress, thin content, weak SEO — good lead
- 30-59: functional but unpolished — maybe
- 0-29: already modern and professional — skip

Reply with JSON only — no markdown, no explanation outside JSON:
{"score":75,"reason":"one sentence max 12 words"}`;

  const text = await generateText(prompt, 80);
  const parsedText = parseScore(text);
  if (!parsedText) {
    throw new Error(`No score in AI response: ${text.slice(0, 80)}`);
  }
  let { score, reason } = parsedText;
  const textScore = score;

  // Hybrid pass: for ambiguous middle-band scores on a reachable site, let a
  // vision model look at the real homepage — visual datedness barely shows up
  // in the HTML signals above.
  if (fetched && score >= VISION_BAND_MIN && score <= VISION_BAND_MAX) {
    const shot = await screenshot(finalUrl);
    if (shot) {
      const visionPrompt = `You help a Finnish web design agency (${BRAND.agencyName}) decide which SMB leads are worth pitching a website redesign to.

This is a screenshot of the homepage of "${lead.companyName}". Judge how dated or unprofessional the site LOOKS — layout, typography, spacing, imagery, overall polish — not just its content.

HTML signals for context:
${signals}

Score 0-100 how much this site needs a redesign (higher = stronger lead for us):
- 90-100: severely outdated, amateur, or broken layout — prime redesign lead
- 60-89: dated, cluttered, or generic template — good lead
- 30-59: decent but unpolished — maybe
- 0-29: clean, modern, professional — skip

Reply with JSON only — no markdown:
{"score":75,"reason":"one sentence max 12 words"}`;

      const visionText = await generateTextFromImage(visionPrompt, shot, "image/jpeg", 80);
      const visionParsed = parseScore(visionText);
      if (visionParsed) {
        score = visionParsed.score;
        reason = visionParsed.reason || reason;
        flags.push(`Vision ${textScore} → ${score}`);
      }
    }
  }

  return { score, reason, flags };
}

export async function POST(req: NextRequest) {
  const { leads } = (await req.json()) as { leads: LeadInput[] };

  if (!Array.isArray(leads) || leads.length === 0) {
    return new Response("No leads provided", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // One headless browser per request, launched lazily on first need and
      // shared across leads. Held in a ref object (not a bare let) so the
      // cached promise guards against concurrent launches when several
      // middle-band leads ask for a shot at once.
      const browser: { launch: Promise<Browser> | null } = { launch: null };
      const screenshot = async (url: string): Promise<string | null> => {
        try {
          if (!browser.launch) {
            browser.launch = puppeteer.launch({
              headless: true,
              args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
          }
          return await captureScreenshot(await browser.launch, url);
        } catch {
          return null;
        }
      };

      try {
        await Promise.all(
          leads.map(async (lead) => {
            if (!lead.url) {
              send({ type: "skip", id: lead.id });
              return;
            }
            try {
              const result = await analyzeOneLead(lead, screenshot);
              send({ type: "result", id: lead.id, score: result.score, reason: result.reason, flags: result.flags });
            } catch (err) {
              send({ type: "error", id: lead.id, message: err instanceof Error ? err.message : String(err) });
            }
          })
        );
      } finally {
        if (browser.launch) {
          try {
            await (await browser.launch).close();
          } catch {
            /* launch failed or already closed */
          }
        }
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
