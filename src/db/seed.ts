// Datos de ejemplo para la demo pública (DEMO_PUBLIC=1). Se cargan una sola vez.
import { eq } from "drizzle-orm";
import type { DB } from "./index";
import * as schema from "./schema";
import { addDays, planVisits, todayISO, weekdayOf, VIDEO_RETENTION_DAYS } from "../lib/schedule";

export const DEMO_USERS = {
  admin: "socio@demo.claraclean.app",
  cleaner: "maria@demo.claraclean.app",
  client: "valentina@demo.claraclean.app",
  host: "carlos@demo.claraclean.app",
  family: "ana@demo.claraclean.app",
} as const;

export async function seedDemo(db: DB) {
  const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USERS.admin));
  if (exists) return;
  const today = todayISO();
  const nextWorkday = (d: string) => (weekdayOf(d) === 0 ? addDays(d, 1) : d);

  const [admin, maria, jose, valentina, carlos, ana] = await db
    .insert(schema.users)
    .values([
      { email: DEMO_USERS.admin, name: "Socio Demo", role: "admin" },
      { email: DEMO_USERS.cleaner, name: "María López", phone: "+1 305 555 0101", role: "cleaner" },
      { email: "jose@demo.claraclean.app", name: "José Rivas", phone: "+1 305 555 0102", role: "cleaner" },
      { email: DEMO_USERS.client, name: "Valentina Ruiz", phone: "+1 305 555 0142", role: "client" },
      {
        email: DEMO_USERS.host,
        name: "Carlos Méndez",
        phone: "+1 786 555 0177",
        role: "client",
        locale: "en",
        stripePaymentMethodId: "pm_demo",
        hostIntroUsed: true,
      },
      { email: DEMO_USERS.family, name: "Ana Pérez", phone: "+1 305 555 0190", role: "client" },
    ])
    .returning();

  const [pVal, pCar, pAna] = await db
    .insert(schema.properties)
    .values([
      { userId: valentina.id, address: "1200 Brickell Bay Dr", unit: "2304", zip: "33131", zone: "Brickell", bedrooms: 2, accessNotes: "Portería: avisar que viene Clara. Llave en conserjería." },
      { userId: carlos.id, address: "601 NE 23rd St", unit: "1810", zip: "33137", zone: "Edgewater", bedrooms: 1, accessNotes: "Lockbox en la puerta, código 4521. Check-out 11 am, check-in 4 pm." },
      { userId: ana.id, address: "10450 NW 74th St", zip: "33178", zone: "Doral", bedrooms: 3, accessNotes: "Casa con portón. Timbre en la entrada." },
    ])
    .returning();

  // Valentina: Clara Plus activo
  const start = nextWorkday(addDays(today, -14));
  const [sub] = await db
    .insert(schema.subscriptions)
    .values({
      userId: valentina.id,
      propertyId: pVal.id,
      plan: "plus",
      bedrooms: 2,
      priceCents: 79500,
      weekday: weekdayOf(start),
      timeSlot: "morning",
      startDate: start,
      scheduledThrough: addDays(today, 56),
      status: "active",
    })
    .returning();
  const visits = planVisits("plus", start, start, addDays(today, 56));
  const subBookings = await db
    .insert(schema.bookings)
    .values(
      visits.map((v) => ({
        userId: valentina.id,
        propertyId: pVal.id,
        subscriptionId: sub.id,
        service: v.service,
        bedrooms: 2,
        date: v.date,
        timeSlot: "morning",
        status: v.date < today ? "completed" : "scheduled",
        priceCents: 0,
        paymentStatus: "included",
        cleanerId: v.date < addDays(today, 8) ? maria.id : null,
        completedAt: v.date < today ? new Date(v.date + "T15:00:00Z") : null,
      })),
    )
    .returning();

  const host = await db
    .insert(schema.bookings)
    .values([
      { userId: carlos.id, propertyId: pCar.id, service: "host", bedrooms: 1, date: addDays(today, -2), timeSlot: "afternoon", status: "completed", priceCents: 5950, paymentStatus: "paid", cleanerId: maria.id, completedAt: new Date() },
      { userId: carlos.id, propertyId: pCar.id, service: "host", bedrooms: 1, date: today, timeSlot: "afternoon", status: "scheduled", priceCents: 11900, paymentStatus: "to_charge", cleanerId: maria.id, customerNotes: "Guests leave at 11. Please restock coffee." },
      { userId: carlos.id, propertyId: pCar.id, service: "host", bedrooms: 1, extras: ["same_day"], date: addDays(today, 3), timeSlot: "afternoon", status: "scheduled", priceCents: 14400, paymentStatus: "to_charge", cleanerId: jose.id },
    ])
    .returning();

  const anaB = await db
    .insert(schema.bookings)
    .values([
      { userId: ana.id, propertyId: pAna.id, service: "deep", bedrooms: 3, extras: ["oven"], date: nextWorkday(addDays(today, -3)), timeSlot: "morning", status: "completed", priceCents: 49000, paymentStatus: "paid", cleanerId: maria.id, completedAt: new Date() },
      { userId: ana.id, propertyId: pAna.id, service: "single", bedrooms: 3, date: nextWorkday(addDays(today, 6)), timeSlot: "morning", status: "scheduled", priceCents: 29900, paymentStatus: "paid" },
    ])
    .returning();

  // Videos de ejemplo en las limpiezas ya terminadas
  const done = [...subBookings, ...host, ...anaB].filter((b) => b.status === "completed");
  if (done.length) {
    await db.insert(schema.videos).values(
      done.map((b) => {
        const created = new Date(b.date + "T17:00:00Z");
        return {
          bookingId: b.id,
          uploadedBy: maria.id,
          provider: "sample",
          providerId: "demo",
          status: "ready",
          durationSeconds: 12,
          createdAt: created,
          expiresAt: new Date(created.getTime() + VIDEO_RETENTION_DAYS * 86_400_000),
          notifiedAt: created,
        };
      }),
    );
  }
  void admin;
}
