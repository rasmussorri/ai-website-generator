import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isSuppressed } from "@/lib/outreach-server";

export const runtime = "nodejs";

// GET /api/outreach/log?leadId=… — the most recent SMS compliance record for a
// lead (what was sent, when, and the surrounding detail), plus whether the
// number has since opted out.
export async function GET(req: Request) {
  const leadId = new URL(req.url).searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const { data: log, error } = await supabaseAdmin
    .from("sms_compliance_log")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const suppressed = log?.phone ? await isSuppressed(log.phone) : false;
  return NextResponse.json({ log: log ?? null, suppressed });
}
