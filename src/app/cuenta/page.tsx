import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { formatUSD } from "@/lib/pricing";
import { TIME_SLOTS, canCustomerCancel, todayISO, type TimeSlot } from "@/lib/schedule";
import { EXTRA_NAMES, SERVICE_NAMES, STATUS_NAMES, formatDate, t } from "@/lib/i18n";
import { demo } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/lib/webhooks";
import type { Video } from "@/db/schema";
import Header from "../components/Header";
import { billingPortalAction, cancelAction, updateCardAction } from "./actions";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function CuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ cancel?: string; demo?: string; tarjeta?: string; session_id?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser(["client", "cleaner"], "/cuenta");
  const locale = await getLocale();
  const d = t(locale);
  const db = await getDb();

  if (sp.tarjeta && sp.session_id && !demo.payments) {
    try {
      const s = await stripe().checkout.sessions.retrieve(sp.session_id);
      if (s.status === "complete" && s.metadata?.userId === user.id) await handleCheckoutCompleted(s);
    } catch (e) {
      console.error(e);
    }
  }

  const bookings = await db
    .select({ b: schema.bookings, p: schema.properties, cleanerName: schema.users.name })
    .from(schema.bookings)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.bookings.propertyId))
    .leftJoin(schema.users, eq(schema.users.id, schema.bookings.cleanerId))
    .where(and(eq(schema.bookings.userId, user.id), ne(schema.bookings.status, "pending_payment")))
    .orderBy(desc(schema.bookings.date));
  const subs = await db
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, user.id), ne(schema.subscriptions.status, "pending")));
  const ids = bookings.map((r) => r.b.id);
  const videos = ids.length
    ? await db.select().from(schema.videos).where(inArray(schema.videos.bookingId, ids)).orderBy(desc(schema.videos.createdAt))
    : [];
  const videoBy = new Map<string, Video>();
  for (const v of videos) if (!videoBy.has(v.bookingId)) videoBy.set(v.bookingId, v);

  const today = todayISO();
  const upcoming = bookings
    .filter((r) => r.b.date >= today && ["scheduled", "in_progress"].includes(r.b.status))
    .reverse();
  const past = bookings.filter((r) => !upcoming.includes(r)).filter((r) => r.b.status !== "scheduled" || r.b.date < today);
  const isHost = bookings.some((r) => r.b.service === "host");
  const hostFailed = bookings.some((r) => r.b.paymentStatus === "failed");

  function videoCell(bookingId: string) {
    const v = videoBy.get(bookingId);
    if (!v) return <span className="muted small">{d.videoNone}</span>;
    if (v.status === "deleted") return <span className="muted small">{d.videoDeleted}</span>;
    if (v.status !== "ready") return <span className="badge info">{d.videoProcessing}</span>;
    return (
      <span className="row">
        <Link className="btn sm" href={`/cuenta/videos/${v.id}`}>
          ▶ {d.watchVideo}
        </Link>
        <span className="muted small">{d.videoExpires(formatDate(v.expiresAt.toISOString(), locale, { weekday: undefined }))}</span>
      </span>
    );
  }

  return (
    <>
      <Header locale={locale} path="/cuenta" />
      <main className="wrap">
        <div className="spread">
          <h1>{user.name ? `${locale === "en" ? "Hi" : "Hola"}, ${user.name.split(" ")[0]}` : d.myAccount}</h1>
          <Link className="btn coral" href="/reservar">
            {d.bookAnother}
          </Link>
        </div>

        {sp.cancel === "ok" && <p className="notice">{locale === "en" ? "Cleaning canceled." : "Limpieza cancelada."}</p>}
        {sp.cancel === "too_late" && <p className="notice warn">{d.cancelTooLate}</p>}
        {sp.demo === "portal" && (
          <p className="notice warn">Modo demo: cuando Stripe esté conectado, este botón abre la página para cambiar la tarjeta o cancelar.</p>
        )}
        {sp.tarjeta && <p className="notice">{locale === "en" ? "Card saved." : "Tarjeta guardada."}</p>}
        {hostFailed && (
          <div className="notice bad row" style={{ marginBottom: 20 }}>
            <span>{locale === "en" ? "We couldn't charge a turnover. Please update your card." : "No pudimos cobrar un turnover. Actualizá tu tarjeta."}</span>
            <form action={updateCardAction}>
              <button className="btn sm">{locale === "en" ? "Update card" : "Actualizar tarjeta"}</button>
            </form>
          </div>
        )}

        {(subs.length > 0 || isHost) && (
          <section className="card">
            <h2>{d.plan}</h2>
            <ul className="list">
              {subs.map((s) => (
                <li key={s.id} className="spread">
                  <div>
                    <strong>{SERVICE_NAMES[s.plan][locale]}</strong> · {d.bedroomsN(s.bedrooms)} · {formatUSD(s.priceCents)} {d.perMonth}
                    {s.extras.length > 0 && <div className="muted small">{s.extras.map((e) => EXTRA_NAMES[e]?.[locale]).join(", ")}</div>}
                  </div>
                  <span className={`badge ${s.status === "active" ? "ok" : s.status === "past_due" ? "bad" : ""}`}>
                    {d.planStatus[s.status] ?? s.status}
                  </span>
                </li>
              ))}
              {isHost && (
                <li className="spread">
                  <div>
                    <strong>Clara Host</strong>
                    <div className="muted small">
                      {locale === "en" ? "We charge each turnover to your saved card." : "Cobramos cada turnover a tu tarjeta guardada."}
                    </div>
                  </div>
                  <form action={updateCardAction}>
                    <button className="btn ghost sm">{locale === "en" ? "Change card" : "Cambiar tarjeta"}</button>
                  </form>
                </li>
              )}
            </ul>
            {subs.some((s) => s.status !== "canceled") && (
              <form action={billingPortalAction} style={{ marginTop: 12 }}>
                <button className="btn ghost sm">{d.managePlan}</button>
              </form>
            )}
          </section>
        )}

        <section className="card">
          <h2>{d.upcoming}</h2>
          {upcoming.length === 0 && <p className="muted">{d.noUpcoming}</p>}
          <ul className="list">
            {upcoming.map(({ b, p, cleanerName }) => (
              <li key={b.id} className="spread">
                <div>
                  <strong>{formatDate(b.date, locale)}</strong> · {TIME_SLOTS[b.timeSlot as TimeSlot]?.[locale]}
                  <div className="muted small">
                    {SERVICE_NAMES[b.service]?.[locale]} · {p.address}
                    {p.unit ? `, ${p.unit}` : ""}
                    {cleanerName ? ` · ${d.cleaner}: ${cleanerName}` : ""}
                  </div>
                </div>
                <div className="row">
                  <span className="badge ok">{STATUS_NAMES[b.status][locale]}</span>
                  {b.status === "scheduled" && canCustomerCancel(b.date, b.timeSlot) && (
                    <form action={cancelAction.bind(null, b.id)}>
                      <button className="btn danger sm">{d.cancel}</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>
            {d.history} · {d.videos}
          </h2>
          {past.length === 0 && <p className="muted">{d.noHistory}</p>}
          <ul className="list">
            {past.map(({ b, p }) => (
              <li key={b.id} className="spread">
                <div>
                  <strong>{formatDate(b.date, locale)}</strong>
                  <div className="muted small">
                    {SERVICE_NAMES[b.service]?.[locale]} · {p.address} · <span>{STATUS_NAMES[b.status]?.[locale]}</span>
                    {b.priceCents > 0 && ` · ${formatUSD(b.priceCents)}`}
                  </div>
                </div>
                {b.status === "completed" ? videoCell(b.id) : null}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
