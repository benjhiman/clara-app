import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "./auth";
import { canUploadToBooking } from "./videos";

export async function bookingForUpload(bookingId: string | null) {
  if (!bookingId || !/^[0-9a-f-]{36}$/.test(bookingId)) return null;
  const user = await currentUser();
  if (!user) return null;
  const db = await getDb();
  const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  if (!booking || !canUploadToBooking(user, booking) || booking.status === "canceled") return null;
  return { user, booking };
}
