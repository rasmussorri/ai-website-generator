import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Crawlers that fetch pages but shouldn't count as a human open. The client
// beacon already filters most of these out (they don't run JS), but a few
// headless agents do — belt and braces.
const BOT_UA = /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slurp|bing|telegram|headless|lighthouse/i;

// Public beacon endpoint (allow-listed in middleware). Records that a demo
// page was opened. Always 204 — never surface errors to the page.
export async function POST(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  const ua = req.headers.get("user-agent") ?? "";

  if (slug && !BOT_UA.test(ua)) {
    await supabaseAdmin.rpc("record_demo_open", { p_slug: slug });
  }

  return new NextResponse(null, { status: 204 });
}
