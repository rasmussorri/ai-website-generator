import { NextResponse } from "next/server";
import { eligibleQueue } from "@/lib/outreach-server";
import { isLiveSms } from "@/lib/twilio";

export const runtime = "nodejs";

// GET: the review queue — eligible leads plus whether Twilio is live or dry-run.
export async function GET() {
  try {
    const leads = await eligibleQueue();
    return NextResponse.json({ leads, sendMode: isLiveSms() ? "live" : "dry-run" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
