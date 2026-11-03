import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { normalizeFinnishPhone, isStopMessage } from "@/lib/sms";
import { validateTwilioSignature, isLiveSms } from "@/lib/twilio";
import { classifyInboundSms, AUTO_CLASSIFIABLE_STAGES } from "@/lib/classify-sms";

export const runtime = "nodejs";

const TWIML_OK = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const xml = (status = 200) =>
  new NextResponse(TWIML_OK, { status, headers: { "Content-Type": "text/xml" } });

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  if (isLiveSms() || process.env.TWILIO_AUTH_TOKEN) {
    const url = process.env.TWILIO_WEBHOOK_URL || reconstructUrl(req);
    const signature = req.headers.get("x-twilio-signature");
    if (!validateTwilioSignature(url, params, signature)) {
      return new NextResponse("invalid signature", { status: 403 });
    }
  }

  const from = params.From;
  const body = params.Body;
  const messageSid = params.MessageSid;
  if (!from || !body) return xml();

  const phone = normalizeFinnishPhone(from) ?? from;

  // STOP → suppress and ack.
  if (isStopMessage(body)) {
    const keyword = body.trim().toLowerCase().split(/\s+/)[0];
    await supabaseAdmin
      .from("sms_suppression")
      .upsert({ phone, reason: "stop", keyword }, { onConflict: "phone" });
    return xml();
  }

  // Regular reply: look up the lead by their phone number.
  // Fast path — exact match on the raw E.164 From or its normalized form
  // (covers rows already stored in E.164).
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, funnel_stage")
    .or(`phone.eq.${from},phone.eq.${phone}`)
    .maybeSingle();

  // Fallback — rows may store the phone in a local/spaced format (e.g.
  // "0xx xxx xxxx") that never equals an E.164 string. Normalise both sides:
  // load phone-bearing leads and compare on the normalised value.
  let matched: { id: string; funnel_stage: string | null } | null = lead ?? null;
  if (!matched) {
    const { data: candidates } = await supabaseAdmin
      .from("leads")
      .select("id, funnel_stage, phone")
      .not("phone", "is", null);
    matched =
      candidates?.find((c) => normalizeFinnishPhone(c.phone) === phone) ?? null;
  }

  if (matched) {
    // Fetch the last outbound message for classifier context (before inserting inbound).
    const { data: lastOut } = AUTO_CLASSIFIABLE_STAGES.has(matched.funnel_stage ?? "contacted")
      ? await supabaseAdmin
          .from("sms_messages")
          .select("body")
          .eq("lead_id", matched.id)
          .eq("direction", "outbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    // Store in the conversation thread.
    await supabaseAdmin.from("sms_messages").insert({
      lead_id: matched.id,
      direction: "inbound",
      body,
      twilio_sid: messageSid ?? null,
    });

    // Classify the reply and advance funnel stage automatically.
    // Falls back to "answered" if no AI key is configured (preserves old behaviour).
    const currentStage = matched.funnel_stage ?? "contacted";
    const newStage =
      (await classifyInboundSms(body, lastOut?.body ?? "", currentStage)) ??
      (currentStage === "contacted" ? "answered" : null);
    if (newStage) {
      await supabaseAdmin
        .from("leads")
        .update({ funnel_stage: newStage })
        .eq("id", matched.id);
    }
  }

  return xml();
}

function reconstructUrl(req: Request): string {
  const h = (name: string) => req.headers.get(name) ?? "";
  const proto = h("x-forwarded-proto") || "https";
  const host = h("x-forwarded-host") || h("host");
  return `${proto}://${host}/api/sms/inbound`;
}
