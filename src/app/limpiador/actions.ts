"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { completeBooking, startBooking } from "@/lib/bookings";

async function ownJob(bookingId: string) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const db = await getDb();
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  if (!b || (user.role !== "admin" && b.cleanerId !== user.id)) throw new Error("No autorizado");
  return b;
}

export async function startJob(bookingId: string) {
  await ownJob(bookingId);
  await startBooking(bookingId);
  revalidatePath(`/limpiador/trabajo/${bookingId}`);
}

export async function finishJob(bookingId: string) {
  await ownJob(bookingId);
  await completeBooking(bookingId);
  revalidatePath(`/limpiador/trabajo/${bookingId}`);
}
