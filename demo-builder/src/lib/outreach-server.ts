/**
 * Server-only query helpers for the SMS outreach queue and suppression list.
 * Mirrors the shape of leads-server.ts — uses the service-role supabaseAdmin client.
 */

import { supabaseAdmin } from "./supabase-server";
import { normalizeFinnishPhone, buildSmsDraft } from "./sms";

/** A lead row plus the derived fields the review queue needs. */
export interface QueueLead {
  id: string;
  company_name: string;
  ceo_name: string | null;
  title: string | null;
  company_size: number | null;
  url: string | null;
  phone: string | null;
  normalizedPhone: string;
  demo_url: string | null;
  draft: string;
}

/** Returns true if the E.164 phone is on the suppression list. */
export async function isSuppressed(phoneE164: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("sms_suppression")
    .select("phone")
    .eq("phone", phoneE164)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Eligible queue: built demos, with a usable phone, not yet actioned
 * (sms_status null), and not on the suppression list.
 */
export async function eligibleQueue(): Promise<QueueLead[]> {
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id,company_name,ceo_name,title,company_size,url,phone,demo_url,has_demo_built,sms_status")
    .eq("has_demo_built", true)
    .is("sms_status", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  // Resolve phones, drop the ones we can't dial.
  const withPhone = (leads ?? [])
    .map((l) => ({ lead: l, normalizedPhone: normalizeFinnishPhone(l.phone) }))
    .filter((x): x is { lead: (typeof leads)[number]; normalizedPhone: string } => x.normalizedPhone !== null);

  if (withPhone.length === 0) return [];

  // One query for all suppressed numbers in the candidate set.
  const phones = withPhone.map((x) => x.normalizedPhone);
  const { data: suppressed } = await supabaseAdmin
    .from("sms_suppression")
    .select("phone")
    .in("phone", phones);
  const suppressedSet = new Set((suppressed ?? []).map((s) => s.phone));

  return withPhone
    .filter((x) => !suppressedSet.has(x.normalizedPhone))
    .map(({ lead, normalizedPhone }) => ({
      id: lead.id,
      company_name: lead.company_name,
      ceo_name: lead.ceo_name ?? null,
      title: lead.title ?? null,
      company_size: lead.company_size ?? null,
      url: lead.url ?? null,
      phone: lead.phone ?? null,
      normalizedPhone,
      demo_url: lead.demo_url ?? null,
      draft: buildSmsDraft(lead),
    }));
}
