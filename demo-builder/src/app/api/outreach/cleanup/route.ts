import { NextResponse } from "next/server";
import { findExpiredDemos, runCleanup, DEMO_EXPIRY_DAYS } from "@/lib/demo-cleanup";

export const runtime = "nodejs";

// Local dashboard-only (blocked on Vercel by middleware).
// GET  → preview which demos would be reclaimed.
// POST → actually reclaim them.
export async function GET() {
  try {
    const expired = await findExpiredDemos(DEMO_EXPIRY_DAYS);
    return NextResponse.json({
      days: DEMO_EXPIRY_DAYS,
      count: expired.length,
      demos: expired.map((d) => ({ company_name: d.company_name, slug: d.demo_slug, sms_sent_at: d.sms_sent_at ?? d.email_sent_at })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runCleanup(DEMO_EXPIRY_DAYS);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
