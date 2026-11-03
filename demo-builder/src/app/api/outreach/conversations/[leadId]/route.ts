import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

// GET: full thread for a lead — all messages sorted oldest→newest.
export async function GET(_req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;

  const [{ data: lead, error: leadErr }, { data: messages, error: msgErr }] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id, company_name, ceo_name, phone, demo_url, funnel_stage, sms_status")
      .eq("id", leadId)
      .single(),
    supabaseAdmin
      .from("sms_messages")
      .select("id, direction, body, twilio_sid, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true }),
  ]);

  if (leadErr) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  return NextResponse.json({ lead, messages: messages ?? [] });
}

// PATCH — mark all unread inbound messages for this lead as read.
export async function PATCH(_req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  await supabaseAdmin
    .from("sms_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .is("read_at", null);
  return NextResponse.json({ ok: true });
}
