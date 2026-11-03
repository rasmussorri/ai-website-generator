import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isSuppressed } from "@/lib/outreach-server";
import { normalizeFinnishPhone, buildSmsDraft, LEGAL_BASIS } from "@/lib/sms";
import { sendSms } from "@/lib/twilio";

export const runtime = "nodejs";

const REVIEWER = process.env.OUTREACH_REVIEWER_ID || "unknown";

// POST { leadId, message?, title?, companySize? }
// Approves one lead: re-checks suppression, sends the SMS, writes the immutable
// compliance record, then marks the lead sent and moves it to the funnel.
export async function POST(req: Request) {
  const { leadId, message, title, companySize } = await req.json();
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  const { data: lead, error: fetchErr } = await supabaseAdmin
    .from("leads")
    .select("id,company_name,ceo_name,title,company_size,url,phone,demo_url,has_demo_built,sms_status")
    .eq("id", leadId)
    .single();

  if (fetchErr || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.sms_status === "sent") return NextResponse.json({ error: "Already sent" }, { status: 409 });

  const phone = normalizeFinnishPhone(lead.phone);
  if (!phone) return NextResponse.json({ error: "Lead has no valid phone number" }, { status: 400 });

  // 1) Re-check suppression at send time (guards against a STOP that arrived
  //    after the queue was loaded).
  if (await isSuppressed(phone)) {
    return NextResponse.json({ error: "Number is on the suppression list" }, { status: 409 });
  }

  // Persist any edits the reviewer made to title / company size before sending,
  // so the values we log match what's on the lead.
  const effectiveTitle = typeof title === "string" ? title : lead.title;
  const effectiveSize =
    companySize === "" || companySize == null ? lead.company_size : Number(companySize);

  const body = typeof message === "string" && message.trim() ? message : buildSmsDraft(lead);

  // 2) Send (or dry-run).
  let result;
  try {
    result = await sendSms({ to: phone, body });
  } catch (e) {
    await supabaseAdmin.from("leads").update({ sms_status: "failed" }).eq("id", leadId);
    const detail = e instanceof Error ? e.message : "send failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  // 3) Immutable compliance record.
  const { error: logErr } = await supabaseAdmin.from("sms_compliance_log").insert({
    lead_id: lead.id,
    company_name: lead.company_name,
    ceo_name: lead.ceo_name,
    title: effectiveTitle,
    company_size: effectiveSize,
    data_source_url: lead.url,
    phone,
    message_body: body,
    demo_url: lead.demo_url,
    reviewer_id: REVIEWER,
    legal_basis: LEGAL_BASIS,
    twilio_sid: result.sid,
    send_mode: result.mode,
  });
  if (logErr) {
    // The SMS already went out — surface the logging failure loudly rather than
    // silently losing the paper trail.
    return NextResponse.json(
      { error: `SMS sent (${result.sid}) but compliance log failed: ${logErr.message}` },
      { status: 500 }
    );
  }

  // 4) Mark sent + advance funnel; persist edited title/size.
  const { error: updErr } = await supabaseAdmin
    .from("leads")
    .update({
      sms_status: "sent",
      sms_sent_at: new Date().toISOString(),
      funnel_stage: "contacted",
      title: effectiveTitle,
      company_size: effectiveSize,
    })
    .eq("id", leadId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // 5) Mirror the outbound message to sms_messages so it appears in the
  //    conversation thread alongside future inbound replies.
  await supabaseAdmin.from("sms_messages").insert({
    lead_id: lead.id,
    direction: "outbound",
    body,
    twilio_sid: result.sid,
  });

  return NextResponse.json({ ok: true, sid: result.sid, mode: result.mode });
}
