import { NextResponse } from "next/server";
import { rmSync } from "fs";
import { resolve } from "path";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { error } = await supabaseAdmin.from("leads").update(body).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: either remove a lead entirely (deleteRow: true) or just reset its demo status.
// Body: { slug?: string, deleteRow?: boolean }
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { slug, deleteRow } = await req.json();

  if (deleteRow) {
    const { error } = await supabaseAdmin.from("leads").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ has_demo_built: false, demo_slug: null, content: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (slug) {
    try {
      rmSync(resolve(process.cwd(), "public", "images", "leads", slug), {
        recursive: true,
        force: true,
      });
    } catch {
      // Ignore — files may not exist locally (e.g. on a fresh clone after deploy)
    }
  }

  return NextResponse.json({ ok: true });
}
