import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// Merges CSV leads into existing data. Leads with matching company_name keep
// their has_demo_built / funnel_stage / demo_slug / site_quality intact.
export async function POST(req: Request) {
  const incoming: Record<string, unknown>[] = await req.json();

  const { data: existing } = await supabaseAdmin.from("leads").select("id,company_name,has_demo_built,funnel_stage,demo_slug,site_quality,batch_name");
  const existingByName = new Map((existing ?? []).map((r) => [String(r.company_name).toLowerCase(), r]));

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];

  for (const row of incoming) {
    const name = String(row.company_name ?? "").toLowerCase();
    const match = existingByName.get(name);
    if (match) {
      // Update contact info only — never overwrite demo/funnel state. Keep the
      // lead's original batch for attribution; only backfill if it had none.
      const patch: Record<string, unknown> = {
        ceo_name: row.ceo_name ?? null,
        url: row.url ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        city: row.city ?? null,
        industry: row.industry ?? null,
      };
      if (!match.batch_name && row.batch_name) patch.batch_name = row.batch_name;
      toUpdate.push({ id: match.id as string, patch });
    } else {
      toInsert.push(row);
    }
  }

  if (toInsert.length) {
    const { error } = await supabaseAdmin.from("leads").insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const { id, patch } of toUpdate) {
    await supabaseAdmin.from("leads").update(patch).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
