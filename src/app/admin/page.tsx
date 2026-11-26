import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { formatUSD } from "@/lib/pricing";
import { TIME_SLOTS, addDays, todayISO, type TimeSlot } from "@/lib/schedule";
import { SERVICE_NAMES, STATUS_NAMES, formatDate } from "@/lib/i18n";
import Header from "../components/Header";
import AdminNav from "./AdminNav";
import AssignSelect from "./AssignSelect";

export const metadata: Metadata = { title: "Admin" };

const PAY: Record<string, { label: string; cls: string }> = {
  paid: { label: "Pagado", cls: "ok" },
  included: { label: "En el plan", cls: "info" },
  to_charge: { label: "Se cobra al terminar", cls: "warn" },
  failed: { label: "Cobro falló", cls: "bad" },
  refunded: { label: "Devuelto", cls: "" },
  unpaid: { label: "Sin pagar", cls: "" },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ desde?: string; sinAsignar?: string }> }) {
  await requireUser(["admin"], "/admin");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayISO();
  const from = sp.desde && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde) ? sp.desde : today;
  const to = addDays(from, 13);
  const client = alias(schema.users, "client");
  const filters = [
    gte(schema.bookings.date, from),
    lte(schema.bookings.date, to),
    inArray(schema.bookings.status, ["scheduled", "in_progress", "completed"]),
  ];
  const rows = await db
    .select({ b: schema.bookings, p: schema.properties, c: client })
    .from(schema.bookings)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.bookings.propertyId))
    .innerJoin(client, eq(client.id, schema.bookings.userId))
    .where(and(...filters))
    .orderBy(asc(schema.bookings.date), asc(schema.bookings.timeSlot));
  const list = sp.sinAsignar ? rows.filter((r) => !r.b.cleanerId && r.b.status !== "completed") : rows;
  const cleaners = await db
    .select()
    .from(schema.users)
    .where(and(inArray(schema.users.role, ["cleaner", "admin"]), eq(schema.users.active, true)));
  const [{ mrr, plans }] = await db
    .select({ mrr: sql<number>`coalesce(sum(${schema.subscriptions.priceCents}),0)::int`, plans: sql<number>`count(*)::int` })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, "active"));
  const unassigned = rows.filter((r) => !r.b.cleanerId && r.b.status !== "completed").length;
  const failed = rows.filter((r) => r.b.paymentStatus === "failed").length;

  const days = new Map<string, typeof list>();
  for (const r of list) days.set(r.b.date, [...(days.get(r.b.date) ?? []), r]);

  return (
    <>
      <Header locale="es" path="/admin" showLang={false} />
      <main className="wrap">
        <h1>Panel de Clara</h1>
        <AdminNav current="/admin" />
        <div className="grid2" style={{ marginBottom: 20 }}>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted small">Planes activos</div>
            <h2 style={{ margin: 0 }}>{plans}</h2>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted small">Ingreso mensual por planes</div>
            <h2 style={{ margin: 0 }}>{formatUSD(mrr)}</h2>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted small">Limpiezas en estas 2 semanas</div>
            <h2 style={{ margin: 0 }}>{rows.length}</h2>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted small">Sin limpiador asignado</div>
            <h2 style={{ margin: 0, color: unassigned ? "var(--bad)" : undefined }}>{unassigned}</h2>
          </div>
        </div>
        {failed > 0 && <p className="notice bad">{failed} cobro(s) de Host fallaron. Entrá al trabajo para reintentar.</p>}

        <div className="spread">
          <div className="row">
            <Link className="btn ghost sm" href={`/admin?desde=${addDays(from, -14)}`}>← Anteriores</Link>
            <Link className="btn ghost sm" href="/admin">Hoy</Link>
            <Link className="btn ghost sm" href={`/admin?desde=${addDays(from, 14)}`}>Siguientes →</Link>
          </div>
          <Link className="btn ghost sm" href={sp.sinAsignar ? `/admin?desde=${from}` : `/admin?desde=${from}&sinAsignar=1`}>
            {sp.sinAsignar ? "Ver todas" : "Solo sin asignar"}
          </Link>
        </div>

        {list.length === 0 && <div className="card muted" style={{ marginTop: 20 }}>No hay limpiezas en estas fechas.</div>}
        {[...days.entries()].map(([date, items]) => (
          <section key={date}>
            <div className="day-head">{date === today ? "Hoy · " : ""}{formatDate(date, "es")}</div>
            <div className="card" style={{ padding: "8px 16px", overflowX: "auto" }}>
              <table>
                <tbody>
                  {items.map(({ b, p, c }) => (
                    <tr key={b.id}>
                      <td style={{ width: 90 }}>{TIME_SLOTS[b.timeSlot as TimeSlot]?.es.split(" (")[0]}</td>
                      <td>
                        <Link href={`/admin/trabajo/${b.id}`}>
                          <strong>{c.name ?? c.email}</strong>
                        </Link>
                        <div className="muted small">
                          {SERVICE_NAMES[b.service]?.es} · {b.bedrooms} hab · {p.zone}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${b.status === "completed" ? "ok" : b.status === "in_progress" ? "info" : ""}`}>
                          {STATUS_NAMES[b.status]?.es}
                        </span>{" "}
                        <span className={`badge ${PAY[b.paymentStatus]?.cls ?? ""}`}>{PAY[b.paymentStatus]?.label ?? b.paymentStatus}</span>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <AssignSelect bookingId={b.id} current={b.cleanerId} cleaners={cleaners.map((cl) => ({ id: cl.id, name: cl.name ?? cl.email }))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
