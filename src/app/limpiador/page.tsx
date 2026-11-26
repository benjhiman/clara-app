import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { TIME_SLOTS, addDays, todayISO, type TimeSlot } from "@/lib/schedule";
import { SERVICE_NAMES, STATUS_NAMES, formatDate } from "@/lib/i18n";
import Header from "../components/Header";

export const metadata: Metadata = { title: "Mis trabajos" };

export default async function LimpiadorPage() {
  const user = await requireUser(["cleaner"], "/limpiador");
  const db = await getDb();
  const today = todayISO();
  const rows = await db
    .select({ b: schema.bookings, p: schema.properties })
    .from(schema.bookings)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.bookings.propertyId))
    .where(
      and(
        eq(schema.bookings.cleanerId, user.id),
        gte(schema.bookings.date, addDays(today, -1)),
        lte(schema.bookings.date, addDays(today, 7)),
        inArray(schema.bookings.status, ["scheduled", "in_progress", "completed"]),
      ),
    )
    .orderBy(asc(schema.bookings.date), asc(schema.bookings.timeSlot));
  const days = new Map<string, typeof rows>();
  for (const r of rows) days.set(r.b.date, [...(days.get(r.b.date) ?? []), r]);
  return (
    <>
      <Header locale="es" path="/limpiador" showLang={false} />
      <main className="wrap narrow">
        <h1>Mis trabajos</h1>
        {rows.length === 0 && <div className="card muted">No tenés trabajos asignados esta semana.</div>}
        {[...days.entries()].map(([date, items]) => (
          <section key={date}>
            <div className="day-head">{date === today ? "Hoy · " : ""}{formatDate(date, "es")}</div>
            {items.map(({ b, p }) => (
              <Link key={b.id} href={`/limpiador/trabajo/${b.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="card" style={{ marginBottom: 10 }}>
                  <div className="spread">
                    <strong>{TIME_SLOTS[b.timeSlot as TimeSlot]?.es}</strong>
                    <span className={`badge ${b.status === "completed" ? "ok" : b.status === "in_progress" ? "info" : ""}`}>
                      {STATUS_NAMES[b.status]?.es}
                    </span>
                  </div>
                  <div>{SERVICE_NAMES[b.service]?.es} · {b.bedrooms} hab</div>
                  <div className="muted small">
                    {p.address}
                    {p.unit ? `, ${p.unit}` : ""} · {p.zone}
                  </div>
                </div>
              </Link>
            ))}
          </section>
        ))}
      </main>
    </>
  );
}
