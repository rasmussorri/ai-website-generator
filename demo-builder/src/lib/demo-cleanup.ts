/**
 * Server-only cleanup of demos that a lead never opened after being contacted.
 *
 * A demo is "expired" when: it's built, still has content, was never reclaimed,
 * the lead was contacted (sms_sent_at or email_sent_at) more than `days` ago, the demo was never
 * opened, and the lead hasn't progressed past "contacted" (so we never reclaim a
 * demo that's tied to a booked meeting or won deal).
 *
 * Reclaiming clears the heavy bits — the Supabase Storage images and the content
 * JSONB — and marks demo_deleted_at, while keeping has_demo_built / demo_slug /
 * demo_url and all the sms, funnel and compliance data for the record. Clearing
 * content makes getLeadBySlug() return null, so the public page 404s.
 */

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "./supabase-server";

export const DEMO_EXPIRY_DAYS = 7;

export interface ExpiredDemo {
  id: string;
  company_name: string;
  demo_slug: string;
  sms_sent_at: string | null;
  email_sent_at: string | null;
}

export async function findExpiredDemos(days = DEMO_EXPIRY_DAYS): Promise<ExpiredDemo[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id,company_name,demo_slug,sms_sent_at,email_sent_at")
    .eq("has_demo_built", true)
    .eq("funnel_stage", "contacted")
    .not("content", "is", null)
    .is("demo_deleted_at", null)
    .is("demo_opened_at", null)
    // First contact (whichever channel went first) is older than the cutoff.
    .or(`sms_sent_at.lt.${cutoff},email_sent_at.lt.${cutoff}`)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ExpiredDemo[];
}

async function deleteDemo(lead: ExpiredDemo): Promise<void> {
  const slug = lead.demo_slug;

  // 1) Remove the lead's image folder from the lead-images bucket.
  if (slug) {
    const dir = `leads/${slug}`;
    const { data: files } = await supabaseAdmin.storage.from("lead-images").list(dir);
    if (files && files.length) {
      await supabaseAdmin.storage.from("lead-images").remove(files.map((f) => `${dir}/${f.name}`));
    }
  }

  // 2) Clear the heavy content + mark reclaimed; keep the row for the record.
  await supabaseAdmin
    .from("leads")
    .update({ content: null, demo_deleted_at: new Date().toISOString() })
    .eq("id", lead.id);

  // 3) Best-effort CDN purge so the page stops serving the cached HTML.
  if (slug) {
    try {
      revalidatePath(`/${slug}`);
    } catch {
      // Not fatal — the page data is already gone (getLeadBySlug → null).
    }
  }
}

export async function runCleanup(days = DEMO_EXPIRY_DAYS): Promise<{ count: number; slugs: string[] }> {
  const expired = await findExpiredDemos(days);
  for (const lead of expired) {
    await deleteDemo(lead);
  }
  return { count: expired.length, slugs: expired.map((l) => l.demo_slug) };
}
