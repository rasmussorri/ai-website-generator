import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

// GET: list of leads that have at least one inbound message, sorted by the
// most recent message (inbound or outbound) descending.
// ?unread=true — fast path: return only the lead IDs that have unread inbound messages.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("unread") === "true") {
    const { data, error } = await supabaseAdmin
      .from("sms_messages")
      .select("lead_id")
      .eq("direction", "inbound")
      .is("read_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const leadIds = [...new Set((data ?? []).map((r: { lead_id: string }) => r.lead_id))];
    return NextResponse.json({ leadIds });
  }

  // All messages grouped by lead — latest message per lead.
  const { data: messages, error } = await supabaseAdmin
    .from("sms_messages")
    .select("lead_id, direction, body, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduplicate: one entry per lead, keep the most recent message as preview.
  const seen = new Set<string>();
  const latestByLead: Record<string, { direction: string; body: string; created_at: string }> = {};
  const inboundLeadIds = new Set<string>();

  for (const msg of messages ?? []) {
    if (!seen.has(msg.lead_id)) {
      seen.add(msg.lead_id);
      latestByLead[msg.lead_id] = { direction: msg.direction, body: msg.body, created_at: msg.created_at };
    }
    if (msg.direction === "inbound") inboundLeadIds.add(msg.lead_id);
  }

  // Only show leads with at least one inbound reply.
  const leadIds = [...inboundLeadIds];
  if (leadIds.length === 0) return NextResponse.json({ conversations: [] });

  const { data: leads, error: leadsErr } = await supabaseAdmin
    .from("leads")
    .select("id, company_name, ceo_name, phone, demo_url, funnel_stage")
    .in("id", leadIds);

  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });

  const conversations = (leads ?? [])
    .map((l) => ({ ...l, latest: latestByLead[l.id] }))
    .sort((a, b) =>
      new Date(b.latest?.created_at ?? 0).getTime() -
      new Date(a.latest?.created_at ?? 0).getTime()
    );

  return NextResponse.json({ conversations });
}
