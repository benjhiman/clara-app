import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { formatUSD } from "@/lib/pricing";
import { TIME_SLOTS, type TimeSlot } from "@/lib/schedule";
import { EXTRA_NAMES, SERVICE_NAMES, STATUS_NAMES, formatDate } from "@/lib/i18n";
import Header from "../../../components/Header";
import AdminNav from "../../AdminNav";
import { adminCancel, adminCharge, adminComplete, updateJob } from "../../actions";
import AssignSelect from "../../AssignSelect";

export default async function AdminTrabajo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  await requireUser(["admin"], `/admin/trabajo/${id}`);
  const db = await getDb();
  const [row] = await db
    .select({ b: schema.bookings, p: schema.properties, c: schema.users })
    .from(schema.bookings)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.bookings.propertyId))
    .innerJoin(schema.users, eq(schema.users.id, schema.bookings.userId))
    .where(eq(schema.bookings.id, id));
  if (!row) notFound();
  const { b, p, c } = row;
  const vids = await db.select().from(schema.videos).where(eq(schema.videos.bookingId, b.id)).orderBy(desc(schema.videos.createdAt));
  const cleaners = await db
    .select()
    .from(schema.users)
    .where(and(inArray(schema.users.role, ["cleaner", "admin"]), eq(schema.users.active, true)));
  const open = ["scheduled", "in_progress", "pending_payment"].includes(b.status);
  return (
    <>
      <Header locale="es" path="/admin" showLang={false} />
      <main className="wrap narrow">
        <AdminNav current="" />
        <p>
          <Link href={`/admin?desde=${b.date}`}>← Agenda</Link>
        </p>
        <div className="spread">
          <h1>{formatDate(b.date, "es")}</h1>
          <span className="badge info">{STATUS_NAMES[b.status]?.es}</span>
        </div>
        {sp.ok && <p className="notice">Guardado.</p>}
        {sp.error && <p className="notice bad">Ese plan ya tiene una visita ese día.</p>}

        <div className="card stack">
          <div>
            <strong>
              {SERVICE_NAMES[b.service]?.es} · {b.bedrooms} hab · {TIME_SLOTS[b.timeSlot as TimeSlot]?.es}
            </strong>
            {b.extras.length > 0 && <div>Extras: {b.extras.map((e) => EXTRA_NAMES[e]?.es).join(", ")}</div>}
            <div className="muted small">
              {b.priceCents > 0 ? formatUSD(b.priceCents) : "Incluido en el plan"} · pago: {b.paymentStatus}
            </div>
          </div>
          <div>
            <strong>{c.name ?? "Sin nombre"}</strong> · <a href={`mailto:${c.email}`}>{c.email}</a>
            {c.phone && (
              <>
                {" · "}
                <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                  {c.phone}
                </a>
              </>
            )}
            <div>
              {p.address}
              {p.unit ? `, ${p.unit}` : ""} · {p.zip} · {p.zone}
            </div>
            {p.accessNotes && <div className="muted small">Cómo entrar: {p.accessNotes}</div>}
            {b.customerNotes && <div className="notice warn small">Nota del cliente: {b.customerNotes}</div>}
          </div>
        </div>

        <div className="card">
          <h2>Limpiador</h2>
          <AssignSelect bookingId={b.id} current={b.cleanerId} cleaners={cleaners.map((cl) => ({ id: cl.id, name: cl.name ?? cl.email }))} />
        </div>

        <div className="card">
          <h2>Fecha y notas</h2>
          <form action={updateJob.bind(null, b.id)}>
            <div className="grid2">
              <div className="field">
                <label>Fecha</label>
                <input type="date" name="date" defaultValue={b.date} />
              </div>
              <div className="field">
                <label>Horario</label>
                <select name="timeSlot" defaultValue={b.timeSlot}>
                  {(Object.keys(TIME_SLOTS) as TimeSlot[]).map((s) => (
                    <option key={s} value={s}>
                      {TIME_SLOTS[s].es}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Nota interna (la ve el limpiador)</label>
              <textarea name="internalNotes" defaultValue={b.internalNotes ?? ""} />
            </div>
            <button className="btn sm">Guardar</button>
          </form>
        </div>

        <div className="card stack">
          <h2>Videos</h2>
          {vids.length === 0 && <p className="muted">Sin video todavía.</p>}
          {vids.map((v) => (
            <div key={v.id} className="spread">
              <span>
                {v.status} · subido {v.createdAt.toLocaleString("es-AR", { timeZone: "America/New_York" })} · se borra{" "}
                {formatDate(v.expiresAt.toISOString(), "es", { weekday: undefined })}
              </span>
              {v.status === "ready" && (
                <Link className="btn sm" href={`/cuenta/videos/${v.id}`}>
                  Ver
                </Link>
              )}
            </div>
          ))}
          <p>
            <Link href={`/limpiador/trabajo/${b.id}`}>Abrir la página del limpiador (para subir un video desde acá)</Link>
          </p>
        </div>

        <div className="card stack">
          <h2>Acciones</h2>
          <div className="row">
            {open && (
              <form action={adminComplete.bind(null, b.id)}>
                <button className="btn sm">Marcar terminada{b.service === "host" ? " y cobrar" : ""}</button>
              </form>
            )}
            {b.service === "host" && b.paymentStatus === "failed" && (
              <form action={adminCharge.bind(null, b.id)}>
                <button className="btn coral sm">Reintentar cobro</button>
              </form>
            )}
          </div>
          {b.status !== "canceled" && b.status !== "completed" && (
            <form action={adminCancel.bind(null, b.id)} className="row">
              {b.paymentStatus === "paid" && (
                <label className="check" style={{ margin: 0 }}>
                  <input type="checkbox" name="refund" defaultChecked /> Devolver el pago
                </label>
              )}
              <button className="btn danger sm">Cancelar limpieza</button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
