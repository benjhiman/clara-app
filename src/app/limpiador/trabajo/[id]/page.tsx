import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { demo } from "@/lib/env";
import { TIME_SLOTS, type TimeSlot } from "@/lib/schedule";
import { EXTRA_NAMES, SERVICE_NAMES, STATUS_NAMES, formatDate } from "@/lib/i18n";
import Header from "../../../components/Header";
import Uploader from "./Uploader";
import { finishJob, startJob } from "../../actions";

export default async function TrabajoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser(["cleaner"], `/limpiador/trabajo/${id}`);
  const db = await getDb();
  const [row] = await db
    .select({ b: schema.bookings, p: schema.properties, c: schema.users })
    .from(schema.bookings)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.bookings.propertyId))
    .innerJoin(schema.users, eq(schema.users.id, schema.bookings.userId))
    .where(eq(schema.bookings.id, id));
  if (!row || (user.role !== "admin" && row.b.cleanerId !== user.id)) notFound();
  const { b, p, c } = row;
  const vids = await db.select().from(schema.videos).where(eq(schema.videos.bookingId, b.id)).orderBy(desc(schema.videos.createdAt));
  const uploaded = vids.filter((v) => v.status !== "uploading" && v.status !== "deleted");
  const fullAddress = `${p.address}${p.unit ? `, ${p.unit}` : ""}, ${p.zip}`;
  return (
    <>
      <Header locale="es" path="/limpiador" showLang={false} />
      <main className="wrap narrow">
        <p>
          <Link href="/limpiador">← Mis trabajos</Link>
        </p>
        <div className="spread">
          <h1>{formatDate(b.date, "es")}</h1>
          <span className="badge info">{STATUS_NAMES[b.status]?.es}</span>
        </div>
        <div className="card stack">
          <div>
            <strong>
              {SERVICE_NAMES[b.service]?.es} · {b.bedrooms} hab
            </strong>
            <div className="muted">{TIME_SLOTS[b.timeSlot as TimeSlot]?.es}</div>
            {b.extras.length > 0 && <div>Extras: {b.extras.map((e) => EXTRA_NAMES[e]?.es).join(", ")}</div>}
          </div>
          <div>
            <div>{fullAddress}</div>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noreferrer">
              Abrir en Google Maps
            </a>
          </div>
          {p.accessNotes && (
            <div className="notice">
              <strong>Cómo entrar:</strong> {p.accessNotes}
            </div>
          )}
          {b.customerNotes && (
            <div className="notice warn">
              <strong>Nota del cliente:</strong> {b.customerNotes}
            </div>
          )}
          {b.internalNotes && (
            <div className="notice">
              <strong>Nota de la oficina:</strong> {b.internalNotes}
            </div>
          )}
          <div className="muted small">
            Cliente: {c.name ?? c.email}
            {c.phone && (
              <>
                {" · "}
                <a href={`tel:${c.phone}`}>{c.phone}</a>
              </>
            )}
          </div>
        </div>

        <div className="card stack">
          <h2>1. Antes de entrar</h2>
          <p className="muted small">Prendé la cámara del pecho (sin audio) antes de abrir la puerta y grabá hasta salir.</p>
          {b.status === "scheduled" && (
            <form action={startJob.bind(null, b.id)}>
              <button className="btn block">Empezar limpieza</button>
            </form>
          )}
          {b.startedAt && <p className="small">✓ Empezó a las {b.startedAt.toLocaleTimeString("es-AR", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })}</p>}
        </div>

        <div className="card stack">
          <h2>2. Subir el video</h2>
          {uploaded.map((v) => (
            <p key={v.id} className="small">
              ✓ Video subido ({v.status === "ready" ? "listo" : v.status === "error" ? "con error, volvé a subirlo" : "procesando"})
            </p>
          ))}
          {b.status !== "canceled" && <Uploader bookingId={b.id} mode={demo.video ? "local" : "stream"} />}
        </div>

        <div className="card stack">
          <h2>3. Terminar</h2>
          {b.status === "completed" ? (
            <p>✓ Terminada.</p>
          ) : (
            <>
              {uploaded.length === 0 && <p className="notice warn">Todavía no subiste el video.</p>}
              <form action={finishJob.bind(null, b.id)}>
                <button className="btn block" disabled={b.status === "canceled"}>
                  Marcar como terminada
                </button>
              </form>
              {b.service === "host" && <p className="muted small">Al terminar se cobra el turnover al host.</p>}
            </>
          )}
        </div>
      </main>
    </>
  );
}
