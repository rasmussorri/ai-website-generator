import OpenAI from "openai";
import { readFileSync, existsSync } from "fs";
import { extname, resolve } from "path";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function mediaTypeFromExt(ext: string): ImageMediaType {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    default: return "image/png";
  }
}

function openaiClient(): OpenAI | null {
  // maxRetries: the two vision calls per lead run in parallel and add to the
  // tokens-per-minute burst during bulk generation; retry transient 429s
  // rather than silently falling back to the heuristic image pick.
  return process.env.OPENAI_API_KEY ? new OpenAI({ maxRetries: 8 }) : null;
}

export interface LogoAssessment {
  usable: boolean;
  primaryColor: string | null;
}

export async function assessLogoWithVision(logoPath: string): Promise<LogoAssessment> {
  const ext = extname(logoPath).toLowerCase();
  // SVGs are vector-clean; skip vision and trust pickNavTheme downstream
  if (ext === ".svg") return { usable: true, primaryColor: null };
  if (!existsSync(logoPath)) return { usable: false, primaryColor: null };

  const client = openaiClient();
  // No key → keep logo, skip visual check
  if (!client) return { usable: true, primaryColor: null };

  try {
    const b64 = readFileSync(logoPath).toString("base64");
    const mt = mediaTypeFromExt(ext);

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 80,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Company logo. Reply ONLY with valid JSON — no markdown.

Displayed on a near-black nav bar (#18181B).

{"usable": true|false, "primaryColor": "#hex"|null}

usable=true: real logo with light/white colors visible on dark background
usable=false: social share card, screenshot, favicon, or dark-on-white logo
primaryColor: most prominent saturated brand color (not white/black/gray), null if monochrome`,
            },
            { type: "image_url", image_url: { url: `data:${mt};base64,${b64}` } },
          ],
        },
      ],
    });

    const cleaned = (res.choices[0]?.message?.content ?? "")
      .trim()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned);
    return {
      usable: parsed.usable === true,
      primaryColor:
        typeof parsed.primaryColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(parsed.primaryColor)
          ? parsed.primaryColor
          : null,
    };
  } catch {
    return { usable: true, primaryColor: null };
  }
}

interface HeroCandidate {
  url: string;
  local: string;
  bytes: number;
  score: number;
}

export async function selectHeroWithVision(
  candidates: HeroCandidate[],
  industry: string,
  slug: string,
): Promise<string> {
  const picsum = `https://picsum.photos/seed/${slug}/1200/900`;
  const root = process.cwd();

  // Pre-filter: top 3 by heuristic score, must exist locally and be >20KB
  const viable = [...(candidates ?? [])]
    .filter((c) => c.bytes > 20_000)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter((c) => existsSync(resolve(root, "public" + c.local)));

  if (viable.length === 0) {
    const biggest = [...(candidates ?? [])].sort((a, b) => b.bytes - a.bytes)[0];
    return biggest?.local ?? picsum;
  }
  if (viable.length === 1) return viable[0].local;

  const client = openaiClient();
  // No key → fall back to heuristic top pick
  if (!client) return viable[0].local;

  const imageBlocks: Array<{ type: "image_url"; image_url: { url: string } }> = [];
  const indexMap: number[] = [];

  for (let i = 0; i < viable.length; i++) {
    const ext = extname(viable[i].local).toLowerCase();
    if (ext === ".svg") continue;
    try {
      const b64 = readFileSync(resolve(root, "public" + viable[i].local)).toString("base64");
      imageBlocks.push({
        type: "image_url",
        image_url: { url: `data:${mediaTypeFromExt(ext)};base64,${b64}` },
      });
      indexMap.push(i);
    } catch {
      /* skip unreadable file */
    }
  }

  if (imageBlocks.length < 2) return viable[0].local;

  try {
    const n = imageBlocks.length;
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 5,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Hero background for a ${industry} company website. ${n} candidate images below.

GOOD: real people at work, equipment, vehicles, job sites, company premises.
BAD: product on white, event banners, advertisement graphics, stock photos, logos.

Reply with only a single number 1–${n} for the best image, or 0 if all are bad.`,
            },
            ...imageBlocks,
          ],
        },
      ],
    });

    const pick = parseInt((res.choices[0]?.message?.content ?? "").trim(), 10);
    if (pick === 0) return picsum;
    if (pick >= 1 && pick <= n) return viable[indexMap[pick - 1]].local;
    return viable[0].local;
  } catch {
    return viable[0].local;
  }
}
