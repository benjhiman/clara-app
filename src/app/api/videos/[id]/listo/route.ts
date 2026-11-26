import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { canUploadToBooking, markUploaded } from "@/lib/videos";

// El limpiador avisa que terminó de subir el video.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "id" }, { status: 400 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const db = await getDb();
  const [row] = await db
    .select({ v: schema.videos, b: schema.bookings })
    .from(schema.videos)
    .innerJoin(schema.bookings, eq(schema.bookings.id, schema.videos.bookingId))
    .where(eq(schema.videos.id, id));
  if (!row || !canUploadToBooking(user, row.b)) return NextResponse.json({ error: "no autorizado" }, { status: 403 });
  if (row.v.status === "uploading") await markUploaded(row.v);
  return NextResponse.json({ ok: true });
}
