import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await req.formData();
  const type = formData.get("type") as "logo" | "hero";
  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string;

  if (!file || !type || !slug) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: row, error: fetchError } = await supabaseAdmin
    .from("leads")
    .select("content, demo_url")
    .eq("id", id)
    .single();
  if (fetchError || !row?.content) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rawExt = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
  const ext = rawExt === "jpg" || rawExt === "jpeg" || rawExt === "png" || rawExt === "webp" ? rawExt : "jpg";
  const storagePath = type === "logo"
    ? `leads/${slug}/logo.${ext}`
    : `leads/${slug}/hero.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("lead-images")
    .upload(storagePath, buffer, { contentType: file.type || "image/jpeg", upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Add cache-buster so Vercel/browser doesn't serve the old cached image
  const baseUrl = supabaseAdmin.storage.from("lead-images").getPublicUrl(storagePath).data.publicUrl;
  const publicUrl = `${baseUrl}?v=${Date.now()}`;

  const content = structuredClone(row.content);
  if (!content.company) content.company = {};
  if (type === "logo") {
    content.company.logo = publicUrl;
  } else {
    content.company.heroImage = publicUrl;
  }

  const { error: updateError } = await supabaseAdmin
    .from("leads")
    .update({ content })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Revalidate local cache (dev) and the correct live Vercel deployment.
  // demo_url stores which deployment owns this page (set at generation time),
  // so we extract its origin to call the right /api/revalidate endpoint.
  revalidatePath(`/${slug}`);
  const revalidateSecret = process.env.REVALIDATE_SECRET;
  if (revalidateSecret && row.demo_url) {
    try {
      const deploymentOrigin = new URL(row.demo_url).origin;
      await fetch(
        `${deploymentOrigin}/api/revalidate?path=/${encodeURIComponent(slug)}&secret=${encodeURIComponent(revalidateSecret)}`
      ).catch(() => {});
    } catch {
      // demo_url malformed — skip revalidation
    }
  }

  return NextResponse.json({ url: publicUrl });
}
