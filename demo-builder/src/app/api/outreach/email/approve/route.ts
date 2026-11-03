import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { sendOutreachEmail } from "@/lib/sendEmail";

export const runtime = "nodejs";

const REVIEWER = process.env.OUTREACH_REVIEWER_ID ?? "unknown";
const LEGAL_BASIS =
  "legitimate interest — cold email B2B Finland, Act on Electronic Communication Services 917/2014";

// POST { leadId, reviewerId? }
export async function POST(req: Request) {
  const body = await req.json();
  const leadId: string | undefined = body.leadId;
  const reviewerId: string = body.reviewerId ?? REVIEWER;

  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  // Config errors must not mark the lead 'failed' (that drops it from the queue for good).
  const missing = ["RESEND_API_KEY", "EMAIL_FROM"].filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    return NextResponse.json(
      { error: `Email not configured — set ${missing.join(" and ")} in .env.local and restart` },
      { status: 500 }
    );
  }

  const { data: lead, error: fetchErr } = await supabaseAdmin
    .from("leads")
    .select(
      "id,company_name,ceo_name,email,title,company_size,url,demo_url,gif_url,email_status"
    )
    .eq("id", leadId)
    .single();

  if (fetchErr || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.email_status === "sent") {
    return NextResponse.json({ error: "Already sent" }, { status: 409 });
  }
  if (!lead.email) {
    return NextResponse.json({ error: "Lead has no email address" }, { status: 400 });
  }

  // Check suppression
  const { data: suppressed } = await supabaseAdmin
    .from("email_suppression")
    .select("email")
    .eq("email", lead.email)
    .maybeSingle();
  if (suppressed) {
    return NextResponse.json({ error: "Email is on the suppression list" }, { status: 409 });
  }

  if (!lead.gif_url || !lead.demo_url) {
    return NextResponse.json(
      { error: "Lead has no GIF or demo URL — load the queue first to generate the GIF" },
      { status: 400 }
    );
  }

  // Send
  let messageId: string;
  try {
    const { id } = await sendOutreachEmail(
      lead.email,
      lead.company_name,
      lead.demo_url,
      lead.gif_url
    );
    messageId = id;
  } catch (e) {
    await supabaseAdmin.from("leads").update({ email_status: "failed" }).eq("id", leadId);
    const detail = e instanceof Error ? e.message : "send failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  // Compliance record
  const { error: logErr } = await supabaseAdmin.from("email_compliance_log").insert({
    lead_id: lead.id,
    contact_email: lead.email,
    company_name: lead.company_name,
    title: lead.title ?? null,
    employee_count: lead.company_size ?? null,
    data_source_url: lead.url ?? null,
    reviewer_id: reviewerId,
    resend_message_id: messageId,
    legal_basis: LEGAL_BASIS,
  });
  if (logErr) {
    return NextResponse.json(
      { error: `Email sent (${messageId}) but compliance log failed: ${logErr.message}` },
      { status: 500 }
    );
  }

  // Mark sent + advance funnel
  const { error: updErr } = await supabaseAdmin
    .from("leads")
    .update({
      email_status: "sent",
      email_sent_at: new Date().toISOString(),
      funnel_stage: "contacted",
    })
    .eq("id", leadId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, messageId });
}
