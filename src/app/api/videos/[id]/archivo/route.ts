import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { LOCAL_VIDEO_DIR, canSeeBooking, canUploadToBooking } from "@/lib/videos";

// Videos guardados en la compu (solo modo demo). En producción se usa Cloudflare Stream.
async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const user = await currentUser();
  if (!user) return null;
  const db = await getDb();
  const [row] = await db
    .select({ v: schema.videos, b: schema.bookings })
    .from(schema.videos)
    .innerJoin(schema.bookings, eq(schema.bookings.id, schema.videos.bookingId))
    .where(eq(schema.videos.id, id));
  if (!row || row.v.provider !== "local") return null;
  return { user, ...row, file: path.join(LOCAL_VIDEO_DIR, `${id}.mp4`) };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id);
  if (!ctx || !canUploadToBooking(ctx.user, ctx.b) || ctx.v.status !== "uploading" || !req.body) {
    return NextResponse.json({ error: "no autorizado" }, { status: 403 });
  }
  await fsp.mkdir(LOCAL_VIDEO_DIR, { recursive: true });
  await pipeline(Readable.fromWeb(req.body as never), fs.createWriteStream(ctx.file));
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id);
  if (!ctx || !canSeeBooking(ctx.user, ctx.b) || ctx.v.status !== "ready") return new NextResponse("No encontrado", { status: 404 });
  const stat = await fsp.stat(ctx.file).catch(() => null);
  if (!stat) return new NextResponse("No encontrado", { status: 404 });
  const range = req.headers.get("range");
  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const stream = Readable.toWeb(fs.createReadStream(ctx.file, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(ctx.file)) as ReadableStream;
  return new NextResponse(stream, { headers: { ...headers, "Content-Length": String(stat.size) } });
}
