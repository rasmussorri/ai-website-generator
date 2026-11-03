import { supabaseAdmin } from "./supabase-server";
import type { Lead } from "@/data/lead-type";

export async function getLeadBySlug(slug: string): Promise<Lead | null> {
  const { data } = await supabaseAdmin
    .from("leads")
    .select("content")
    .eq("demo_slug", slug)
    .single();
  return (data?.content as Lead) ?? null;
}
