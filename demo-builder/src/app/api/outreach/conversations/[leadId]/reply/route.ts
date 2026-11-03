import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isSuppressed } from "@/lib/outreach-server";
import { normalizeFinnishPhone } from "@/lib/sms";
import { sendSms } from "@/lib/twilio";

export const runtime = "nodejs";

// POST { message } — send a reply to a lead and store it in the thread.
export async function POST(req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  const { data: lead, error: fetchErr } = await supabaseAdmin
    .from("leads")
    .select("id, company_name, phone")
    .eq("id", leadId)
    .single();

  if (fetchErr || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const phone = normalizeFinnishPhone(lead.phone);
  if (!phone) return NextResponse.json({ error: "Lead has no valid phone number" }, { status: 400 });

  if (await isSuppressed(phone)) {
    return NextResponse.json({ error: "Number is on the suppression list" }, { status: 409 });
  }

  let result;
  try {
    result = await sendSms({ to: phone, body: message.trim() });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "send failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("sms_messages")
    .insert({
      lead_id: lead.id,
      direction: "outbound",
      body: message.trim(),
      twilio_sid: result.sid,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ message: inserted, sid: result.sid, mode: result.mode });
}
