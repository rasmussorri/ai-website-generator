import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { captureAndUploadGif } from "@/lib/captureGif";
import { buildEmailSubject, buildEmailText, EMAIL_SENDER } from "@/lib/emailTemplate";
import { BRAND } from "@/lib/brand";

export const runtime = "nodejs";

export interface EmailQueueLead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string;
  title: string | null;
  employeeCount: number | null;
  dataSourceUrl: string | null;
  demoUrl: string | null;
  gifUrl: string | null;
  /** Exactly what approve will send — rendered server-side from the env templates. */
  emailSubject: string;
  emailText: string;
}

// Builds the email queue: leads with a demo, an email, and no email_status yet.
// Captures GIFs synchronously for any lead that doesn't have one cached.
export async function GET() {
  // Fetch eligible leads
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select(
      "id,company_name,ceo_name,email,title,company_size,url,demo_url,gif_url,email_status,has_demo_built"
    )
    .eq("has_demo_built", true)
    .is("email_status", null)
    .not("email", "is", null)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Check suppression list
  const emails = (leads ?? []).map((l) => l.email as string);
  const { data: suppressed } = emails.length
    ? await supabaseAdmin
        .from("email_suppression")
        .select("email")
        .in("email", emails)
    : { data: [] };
  const suppressedSet = new Set((suppressed ?? []).map((s: { email: string }) => s.email));

  const eligible = (leads ?? []).filter(
    (l) => l.email && !suppressedSet.has(l.email as string)
  );

  // Capture GIFs for any lead that doesn't have one yet (sequential to avoid OOM)
  const result: EmailQueueLead[] = [];
  for (const lead of eligible) {
    let gifUrl: string | null = lead.gif_url ?? null;

    if (!gifUrl && lead.demo_url) {
      try {
        gifUrl = await captureAndUploadGif(lead.demo_url, lead.id);
        await supabaseAdmin.from("leads").update({ gif_url: gifUrl }).eq("id", lead.id);
      } catch (e) {
        // GIF capture failed — return the lead without a GIF so the queue still loads
        console.error(`GIF capture failed for ${lead.id}:`, e);
      }
    }

    result.push({
      id: lead.id,
      companyName: lead.company_name,
      contactName: lead.ceo_name ?? null,
      contactEmail: lead.email as string,
      title: lead.title ?? null,
      employeeCount: lead.company_size ?? null,
      dataSourceUrl: lead.url ?? null,
      demoUrl: lead.demo_url ?? null,
      gifUrl,
      emailSubject: buildEmailSubject(lead.company_name),
      emailText: buildEmailText(lead.company_name, lead.demo_url ?? "—"),
    });
  }

  return NextResponse.json({
    leads: result,
    signature: { name: EMAIL_SENDER, website: BRAND.agencyWebsite },
  });
}
