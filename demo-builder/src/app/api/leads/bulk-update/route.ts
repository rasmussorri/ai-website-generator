import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// Upserts multiple leads at once (e.g. after marking demos as built).
export async function POST(req: Request) {
  const rows = await req.json();
  const { error } = await supabaseAdmin.from("leads").upsert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
