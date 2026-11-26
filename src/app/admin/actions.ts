"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser, normalizeEmail, upsertUser } from "@/lib/auth";
import { cancelBooking, chargeHostBooking, completeBooking } from "@/lib/bookings";
import { isTimeSlot } from "@/lib/schedule";

async function admin() {
  const u = await currentUser();
  if (!u || u.role !== "admin") redirect("/entrar?next=/admin");
  return u;
}

async function getBooking(id: string) {
  const db = await getDb();
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id));
  if (!b) throw new Error("No existe");
  return b;
}

export async function assignCleaner(bookingId: string, form: FormData) {
  await assignCleanerTo(bookingId, String(form.get("cleanerId") ?? ""));
}

export async function assignCleanerTo(bookingId: string, cleanerId: string) {
  await admin();
  if (cleanerId) {
    const db0 = await getDb();
    const [c] = await db0.select().from(schema.users).where(eq(schema.users.id, cleanerId));
    if (!c || !["cleaner", "admin"].includes(c.role)) throw new Error("Limpiador no válido");
  }
  const db = await getDb();
  await db
    .update(schema.bookings)
    .set({ cleanerId: cleanerId || null })
    .where(eq(schema.bookings.id, bookingId));
  revalidatePath("/admin");
  revalidatePath(`/admin/trabajo/${bookingId}`);
}

export async function updateJob(bookingId: string, form: FormData) {
  await admin();
  const date = String(form.get("date") ?? "");
  const slot = String(form.get("timeSlot") ?? "");
  const notes = String(form.get("internalNotes") ?? "").slice(0, 2000);
  const patch: Partial<typeof schema.bookings.$inferInsert> = { internalNotes: notes || null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) patch.date = date;
  if (isTimeSlot(slot)) patch.timeSlot = slot;
  const db = await getDb();
  try {
    await db.update(schema.bookings).set(patch).where(eq(schema.bookings.id, bookingId));
  } catch {
    redirect(`/admin/trabajo/${bookingId}?error=fecha`);
  }
  revalidatePath(`/admin/trabajo/${bookingId}`);
  redirect(`/admin/trabajo/${bookingId}?ok=1`);
}

export async function adminComplete(bookingId: string) {
  await admin();
  await completeBooking(bookingId);
  revalidatePath(`/admin/trabajo/${bookingId}`);
}

export async function adminCancel(bookingId: string, form: FormData) {
  await admin();
  const b = await getBooking(bookingId);
  await cancelBooking(b, { refund: form.get("refund") === "on" });
  revalidatePath(`/admin/trabajo/${bookingId}`);
}

export async function adminCharge(bookingId: string) {
  await admin();
  await chargeHostBooking(bookingId);
  revalidatePath(`/admin/trabajo/${bookingId}`);
}

export async function addCleaner(form: FormData) {
  await admin();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) redirect("/admin/equipo?error=1");
  const u = await upsertUser(email, { name, phone });
  if (u.role === "admin") redirect("/admin/equipo?error=admin");
  const db = await getDb();
  await db.update(schema.users).set({ role: "cleaner", active: true, name, phone: phone || u.phone }).where(eq(schema.users.id, u.id));
  revalidatePath("/admin/equipo");
  redirect("/admin/equipo?ok=1");
}

export async function setCleanerActive(userId: string, active: boolean) {
  await admin();
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ active })
    .where(and(eq(schema.users.id, userId), eq(schema.users.role, "cleaner")));
  revalidatePath("/admin/equipo");
}
