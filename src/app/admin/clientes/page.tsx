import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { formatUSD } from "@/lib/pricing";
import { SERVICE_NAMES } from "@/lib/i18n";
import Header from "../../components/Header";
import AdminNav from "../AdminNav";

export const metadata: Metadata = { title: "Clientes" };

export default async function Clientes() {
  await requireUser(["admin"], "/admin/clientes");
  const db = await getDb();
  const clients = await db
    .select({
      u: schema.users,
      bookings: sql<number>`(select count(*)::int from ${schema.bookings} b where b.user_id = ${schema.users.id} and b.status = 'completed')`,
      revenue: sql<number>`(select coalesce(sum(b.price_cents),0)::int from ${schema.bookings} b where b.user_id = ${schema.users.id} and b.payment_status = 'paid')`,
      zone: sql<string | null>`(select p.zone from ${schema.properties} p where p.user_id = ${schema.users.id} order by p.created_at desc limit 1)`,
    })
    .from(schema.users)
    .where(eq(schema.users.role, "client"))
    .orderBy(desc(schema.users.createdAt));
  const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.status, "active"));
  const planBy = new Map(subs.map((s) => [s.userId, s]));
  return (
    <>
      <Header locale="es" path="/admin" showLang={false} />
      <main className="wrap">
        <h1>Clientes</h1>
        <AdminNav current="/admin/clientes" />
        <div className="card" style={{ overflowX: "auto" }}>
          {clients.length === 0 && <p className="muted">Todavía no hay clientes.</p>}
          {clients.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Zona</th>
                  <th>Plan</th>
                  <th>Limpiezas</th>
                  <th>Pagos sueltos</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(({ u, bookings, revenue, zone }) => {
                  const plan = planBy.get(u.id);
                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name ?? "Sin nombre"}</strong>
                        <div className="muted small">
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ""}
                        </div>
                      </td>
                      <td>{zone ?? "—"}</td>
                      <td>{plan ? `${SERVICE_NAMES[plan.plan].es} · ${formatUSD(plan.priceCents)}/mes` : u.stripePaymentMethodId ? "Host" : "—"}</td>
                      <td>{bookings}</td>
                      <td>{formatUSD(revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
