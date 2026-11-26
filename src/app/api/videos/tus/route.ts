import { NextResponse } from "next/server";
import { demo } from "@/lib/env";
import { createStreamUpload } from "@/lib/videos";
import { bookingForUpload } from "@/lib/video-access";

// El celular del limpiador pide acá un lugar para subir; después manda el archivo directo a Cloudflare.
export async function POST(req: Request) {
  if (demo.video) return NextResponse.json({ error: "Cloudflare Stream no está configurado" }, { status: 400 });
  const url = new URL(req.url);
  const ctx = await bookingForUpload(url.searchParams.get("bookingId"));
  if (!ctx) return NextResponse.json({ error: "no autorizado" }, { status: 403 });
  const length = Number(req.headers.get("upload-length"));
  if (!Number.isFinite(length) || length <= 0) return NextResponse.json({ error: "falta Upload-Length" }, { status: 400 });
  const { location, video } = await createStreamUpload(ctx.booking, ctx.user, length, url.searchParams.get("name") ?? "video");
  return new NextResponse(null, {
    status: 201,
    headers: {
      Location: location,
      "Tus-Resumable": "1.0.0",
      "X-Video-Id": video.id,
      "Access-Control-Expose-Headers": "Location, X-Video-Id",
    },
  });
}
