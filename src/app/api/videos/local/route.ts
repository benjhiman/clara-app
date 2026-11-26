import { NextResponse } from "next/server";
import { demo } from "@/lib/env";
import { createLocalUpload } from "@/lib/videos";
import { bookingForUpload } from "@/lib/video-access";

// Solo modo demo: crea el registro del video que después se sube a la carpeta .data
export async function POST(req: Request) {
  if (!demo.video) return NextResponse.json({ error: "usar Cloudflare Stream" }, { status: 400 });
  const { bookingId, size } = (await req.json()) as { bookingId?: string; size?: number };
  const ctx = await bookingForUpload(bookingId ?? null);
  if (!ctx) return NextResponse.json({ error: "no autorizado" }, { status: 403 });
  // En la demo pública no guardamos el archivo: se usa un video de ejemplo.
  const video = await createLocalUpload(ctx.booking, ctx.user, Number(size) || 0, demo.public);
  return NextResponse.json({ id: video.id, uploadUrl: demo.public ? null : `/api/videos/${video.id}/archivo` });
}
