import { NextResponse } from "next/server";
import { runCleanup, DEMO_EXPIRY_DAYS } from "@/lib/demo-cleanup";

export const runtime = "nodejs";

// Daily Vercel cron (see vercel.json). Public on Vercel but gated by CRON_SECRET.
// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when the env
// var is set on the project.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCleanup(DEMO_EXPIRY_DAYS);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
