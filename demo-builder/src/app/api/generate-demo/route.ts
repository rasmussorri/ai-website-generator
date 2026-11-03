import { NextRequest } from "next/server";
import { generateText } from "@/lib/ai";
import { readFileSync, existsSync, readdirSync } from "fs";
import { execSync } from "child_process";
import { resolve, extname } from "path";
import { supabaseAdmin } from "@/lib/supabase-server";
import { pickNavTheme } from "@/lib/logo-theme";
import { assessLogoWithVision, selectHeroWithVision } from "@/lib/vision-select";


interface RawJson {
  slug: string;
  sourceUrl: string;
  isPlaceholderSite: boolean;
  title: string | null;
  description: string | null;
  themeColor: string | null;
  logo: { sourceUrl: string; local: string } | null;
  heroCandidates: Array<{ url: string; local: string; bytes: number; score: number }>;
  contacts: { phones: string[]; emails: string[] };
  navLinks: Array<{ label: string; href: string }>;
  rawTextSnippet: string;
}

interface HaikuOutput {
  tagline: string;
  city: string;
  industry: string;
  primaryColor: string;
  locations?: string[];
  hero: {
    headline: string;
    subtext: string;
    credentialStrip: string[];
  };
  services: Array<{ name: string; description: string; iconName: string }>;
  servicesSection: {
    heading: string;
    subtext: string;
    ctaCardHeading: string;
    ctaCardBody: string;
  };
  brands: Array<{ name: string; description: string }>;
  brandsSection: {
    sectionLabel: string;
    heading: string;
    subtext: string;
    cardEyebrow: string;
    cardFootnote: string;
  };
  about: {
    heading: string;
    text: string;
    highlights: Array<{ value: string; label: string }>;
    quote: string;
  };
  contactSubtext: string;
}

function buildHaikuPrompt(
  params: { slug: string; company: string; ceo: string; phone: string; email: string; url: string },
  raw: RawJson
): string {
  const snippet = (raw.rawTextSnippet ?? "").slice(0, 2000);
  const navText = (raw.navLinks ?? []).map((n) => n.label).join(", ");

  return `You are writing content for a B2B sales demo website. Return ONLY a valid JSON object — no markdown, no code fences, no explanation.

Company info:
- Name: ${params.company}
- CEO: ${params.ceo}
- Phone: ${params.phone}
- Email: ${params.email}
- URL: ${params.url}
- Site title: ${raw.title ?? ""}
- Site description: ${raw.description ?? ""}
- Nav items: ${navText}
- Website text: ${snippet}

Write in the language of the website (Finnish if Finnish company). Rewrite copy sharp and punchy — never copy verbatim. No invented stats. No financial figures (no €, revenue, profit %).

Available iconName values: Truck, Wrench, Package, Building, Timer, Hammer, Droplet, Zap, Settings, Shield, Users, MapPin, Layers, Cog, Star

Return exactly this JSON structure:
{
  "tagline": "ALL CAPS 3-6 WORD TAGLINE",
  "city": "HQ city",
  "industry": "OneWordIndustry",
  "primaryColor": "#hex brand color suitable for CTA buttons",
  "locations": ["City1"],
  "hero": {
    "headline": "Punchy 3-7 word headline",
    "subtext": "One sentence max 25 words describing what they do",
    "credentialStrip": ["Proof point 1", "Proof point 2", "Proof point 3"]
  },
  "services": [
    { "name": "Service name", "description": "One sentence.", "iconName": "Truck" }
  ],
  "servicesSection": {
    "heading": "Section heading",
    "subtext": "One sentence",
    "ctaCardHeading": "Dark CTA card heading",
    "ctaCardBody": "1-2 sentences"
  },
  "brands": [
    { "name": "Brand or segment name", "description": "Short description" }
  ],
  "brandsSection": {
    "sectionLabel": "Edustamamme merkit or Kohteet etc.",
    "heading": "Punchy dark-bg section heading",
    "subtext": "One sentence",
    "cardEyebrow": "Partner or Kohdetyyppi etc.",
    "cardFootnote": "Official Distributor or Referenssejä saatavilla etc."
  },
  "about": {
    "heading": "About section heading",
    "text": "2-3 sentences about the company",
    "highlights": [
      { "value": "35+", "label": "vuotta alalla" },
      { "value": "...", "label": "..." },
      { "value": "...", "label": "..." }
    ],
    "quote": "CEO voice quote max 25 words"
  },
  "contactSubtext": "One sentence inviting contact with response promise"
}`;
}

function buildLeadObject(
  slug: string,
  params: { company: string; ceo: string; phone: string; email: string; url: string },
  d: HaikuOutput,
  logoPath: string | null,
  heroImagePath: string,
  navTheme: "light" | "dark" | null
) {
  return {
    slug,
    company: {
      name: params.company,
      tagline: d.tagline,
      city: d.city,
      industry: d.industry,
      phone: params.phone,
      email: params.email,
      website: params.url,
      primaryColor: d.primaryColor,
      ...(logoPath ? { logo: logoPath } : {}),
      ...(navTheme ? { navTheme } : {}),
      heroImage: heroImagePath,
      ...(d.locations && d.locations.length > 1 ? { locations: d.locations } : {}),
    },
    hero: {
      headline: d.hero.headline,
      subtext: d.hero.subtext,
      ctaPrimary: { label: "Pyydä tarjous", href: "#yhteystiedot" },
      ctaSecondary: { label: "Tutustu palveluihin", href: "#features" },
      credentialStrip: d.hero.credentialStrip,
    },
    nav: [
      { label: "Palvelut", href: "#features" },
      { label: "Tietoa meistä", href: "#about" },
      { label: "Yhteystiedot", href: "#yhteystiedot" },
    ],
    services: d.services,
    servicesSection: {
      heading: d.servicesSection.heading,
      subtext: d.servicesSection.subtext,
      sectionLabel: "Palvelumme",
      ctaLabel: "Kysy lisää →",
      ctaCardHeading: d.servicesSection.ctaCardHeading,
      ctaCardBody: d.servicesSection.ctaCardBody,
    },
    brands: d.brands ?? [],
    brandsSection: d.brandsSection,
    about: {
      heading: d.about.heading,
      text: d.about.text,
      highlights: d.about.highlights,
      quote: d.about.quote,
      quoteAuthor: params.company,
      ceoName: params.ceo,
      sectionLabel: "Tietoa meistä",
      ctaLabel: "Ota yhteyttä",
      ctaHref: "#yhteystiedot",
    },
    contact: {
      heading: "Otetaan yhteyttä",
      subtext: d.contactSubtext,
      cta: "Lähetä viesti",
      sectionLabel: "Yhteystiedot",
      variant: "form",
    },
  };
}

function imageContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".svg": return "image/svg+xml";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    default: return "image/png";
  }
}

async function uploadImage(localPath: string, storagePath: string, ext: string): Promise<string> {
  const buffer = readFileSync(localPath);
  const { error } = await supabaseAdmin.storage
    .from("lead-images")
    .upload(storagePath, buffer, { contentType: imageContentType(ext), upsert: true });
  if (error) throw new Error(`Image upload failed (${storagePath}): ${error.message}`);
  return supabaseAdmin.storage.from("lead-images").getPublicUrl(storagePath).data.publicUrl;
}

function sseError(message: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`),
    { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
  );
}

export async function POST(req: NextRequest) {
  if (process.env.VERCEL) {
    return sseError(
      "Generation only works when running the dashboard locally.\n\n" +
        "Pull the latest code, run  npm run dev  inside demo-builder/, " +
        "then open http://localhost:3000/dashboard and generate from there."
    );
  }

  const { leadId, slug, url, company, ceo, phone = "", email = "" } = await req.json();
  const cwd = resolve(/* turbopackIgnore: true */ process.cwd());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));

      try {
        // 1. Scrape the website
        send({ type: "log", text: `Scraping ${url}…\n` });
        execSync(`npm run scrape -- --slug=${slug} --url=${url}`, { cwd, stdio: "pipe" });

        // 2. Read scraped data
        const rawPath = resolve(cwd, `leads/${slug}/raw.json`);
        const raw: RawJson = JSON.parse(readFileSync(rawPath, "utf-8"));

        // 3. Generate all copy with a single AI call
        send({ type: "log", text: "Generating copy…\n" });
        let rawJson = (await generateText(buildHaikuPrompt({ slug, url, company, ceo, phone, email }, raw), 2048)).trim();
        rawJson = rawJson.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        const data: HaikuOutput = JSON.parse(rawJson);

        // 4. Select best images with vision and upload to Supabase Storage
        send({ type: "log", text: "Uploading images…\n" });
        const imagesDir = resolve(cwd, `public/images/leads/${slug}`);

        const logoFiles = existsSync(imagesDir)
          ? readdirSync(imagesDir).filter((f) => f.startsWith("logo-original"))
          : [];

        const [logoAssessment, heroLocal] = await Promise.all([
          logoFiles.length > 0
            ? assessLogoWithVision(resolve(imagesDir, logoFiles[0]))
            : Promise.resolve({ usable: false, primaryColor: null }),
          selectHeroWithVision(raw.heroCandidates, data.industry, slug),
        ]);

        let logoPath: string | null = null;
        let navTheme: "light" | "dark" | null = null;
        if (logoFiles.length > 0 && logoAssessment.usable) {
          const origFile = logoFiles[0];
          const ext = extname(origFile) || ".png";
          const localLogo = resolve(imagesDir, origFile);
          navTheme = await pickNavTheme(localLogo);
          logoPath = await uploadImage(localLogo, `leads/${slug}/logo${ext}`, ext);
        }
        if (logoAssessment.primaryColor) {
          data.primaryColor = logoAssessment.primaryColor;
        }

        let heroImagePath: string;
        if (heroLocal.startsWith("http")) {
          heroImagePath = heroLocal;
        } else {
          const heroSrc = resolve(cwd, "public" + heroLocal);
          if (existsSync(heroSrc)) {
            heroImagePath = await uploadImage(heroSrc, `leads/${slug}/hero.jpg`, ".jpg");
          } else {
            heroImagePath = `https://picsum.photos/seed/${slug}/1200/900`;
          }
        }

        // 5. Build lead object and save to Supabase
        const leadObject = buildLeadObject(slug, { company, ceo, phone, email, url }, data, logoPath, heroImagePath, navTheme);

        send({ type: "log", text: "Saving to Supabase…\n" });
        const base = (process.env.NEXT_PUBLIC_DEMO_BASE_URL ?? "").replace(/\/$/, "");
        const demoUrl = `${base}/${slug}`;
        await supabaseAdmin
          .from("leads")
          .update({ has_demo_built: true, demo_slug: slug, demo_url: demoUrl, content: leadObject, demo_built_at: new Date().toISOString() })
          .eq("id", leadId);

        send({ type: "done", slug, demoUrl });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
