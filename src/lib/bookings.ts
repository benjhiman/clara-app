import "server-only";
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Booking, Property, Subscription, User } from "@/db/schema";
import { demo, env } from "./env";
import { quote, toCents, isPlan, formatUSD, type Service } from "./pricing";
import {
  addDays,
  canCustomerCancel,
  planVisits,
  todayISO,
  validateDate,
  weekdayOf,
  zoneForZip,
  SUBSCRIPTION_HORIZON_DAYS,
  TIME_SLOTS,
  type TimeSlot,
} from "./schedule";
import { upsertUser } from "./auth";
import { stripe, ensureCustomer, launchCoupon } from "./stripe";
import { sendEmail } from "./email";
import { asLocale, formatDate, SERVICE_NAMES, type Locale } from "./i18n";

export type BookingInput = {
  service: Service;
  bedrooms: number;
  extras: string[];
  address: string;
  unit?: string;
  zip: string;
  accessNotes?: string;
  date: string;
  timeSlot: TimeSlot;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  locale: Locale;
};

export class BookingError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function findOrCreateProperty(user: User, input: BookingInput, zone: string): Promise<Property> {
  const db = await getDb();
  const unit = input.unit?.trim() || null;
  const existing = await db.select().from(schema.properties).where(eq(schema.properties.userId, user.id));
  const match = existing.find(
    (p) =>
      p.address.toLowerCase() === input.address.trim().toLowerCase() &&
      (p.unit ?? "") === (unit ?? "") &&
      p.zip === input.zip.trim(),
  );
  if (match) {
    const patch: Partial<Property> = { bedrooms: input.bedrooms };
    if (input.accessNotes?.trim()) patch.accessNotes = input.accessNotes.trim();
    const [p] = await db.update(schema.properties).set(patch).where(eq(schema.properties.id, match.id)).returning();
    return p;
  }
  const [p] = await db
    .insert(schema.properties)
    .values({
      userId: user.id,
      address: input.address.trim(),
      unit,
      zip: input.zip.trim().slice(0, 5),
      zone,
      bedrooms: input.bedrooms,
      accessNotes: input.accessNotes?.trim() || null,
    })
    .returning();
  return p;
}

/** Crea la reserva (o el plan) y devuelve la URL a la que hay que mandar al cliente. */
export async function createBooking(input: BookingInput): Promise<string> {
  const zone = zoneForZip(input.zip);
  if (!zone) throw new BookingError("zip");
  const dateErr = validateDate(input.service, input.date, input.extras);
  if (dateErr) throw new BookingError(dateErr);

  const db = await getDb();
  const user = await upsertUser(input.email, { name: input.name, phone: input.phone, locale: input.locale });
  const property = await findOrCreateProperty(user, input, zone);
  const success = `${env.appUrl}/reservar/listo`;
  const cancelUrl = `${env.appUrl}/reservar?cancelado=1`;
  const lang = input.locale;

  // ---------- Planes (suscripción mensual) ----------
  if (isPlan(input.service)) {
    const q = quote(input.service, input.bedrooms, input.extras);
    const [sub] = await db
      .insert(schema.subscriptions)
      .values({
        userId: user.id,
        propertyId: property.id,
        plan: input.service,
        bedrooms: input.bedrooms,
        priceCents: toCents(q.recurring!),
        extras: input.extras,
        weekday: weekdayOf(input.date),
        timeSlot: input.timeSlot,
        startDate: input.date,
      })
      .returning();
    if (demo.payments) {
      await activateSubscription(sub.id, null);
      return `${success}?demo=1`;
    }
    const customer = await ensureCustomer(user);
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      locale: lang,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: sub.priceCents,
            recurring: { interval: "month" },
            product_data: {
              name: `${SERVICE_NAMES[input.service][lang]} · ${input.bedrooms} ${lang === "en" ? "bd" : "hab"}`,
            },
          },
        },
      ],
      discounts: [{ coupon: await launchCoupon() }],
      metadata: { kind: "subscription", subscriptionId: sub.id },
      subscription_data: { metadata: { subscriptionId: sub.id } },
      success_url: `${success}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
    });
    await db
      .update(schema.subscriptions)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(schema.subscriptions.id, sub.id));
    return session.url!;
  }

  // ---------- Clara Host (tarjeta guardada, cobro por turnover) ----------
  if (input.service === "host") {
    const previousHost = await db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.userId, user.id), eq(schema.bookings.service, "host"), ne(schema.bookings.status, "canceled")));
    const hostIntro = !user.hostIntroUsed && previousHost.length === 0;
    const q = quote("host", input.bedrooms, input.extras, { hostIntro });
    const hasCard = !!user.stripePaymentMethodId || demo.payments;
    const [b] = await db
      .insert(schema.bookings)
      .values({
        userId: user.id,
        propertyId: property.id,
        service: "host",
        bedrooms: input.bedrooms,
        extras: input.extras,
        date: input.date,
        timeSlot: input.timeSlot,
        priceCents: toCents(q.dueNow),
        customerNotes: input.notes?.trim() || null,
        status: hasCard ? "scheduled" : "pending_payment",
        paymentStatus: "to_charge",
      })
      .returning();
    if (hostIntro) await db.update(schema.users).set({ hostIntroUsed: true }).where(eq(schema.users.id, user.id));
    if (hasCard) {
      await sendBookingConfirmed(b.id);
      return `${success}?demo=${demo.payments ? 1 : 0}`;
    }
    const customer = await ensureCustomer(user);
    const session = await stripe().checkout.sessions.create({
      mode: "setup",
      customer,
      locale: lang,
      currency: "usd",
      metadata: { kind: "host_setup", bookingId: b.id },
      setup_intent_data: { metadata: { bookingId: b.id } },
      success_url: `${success}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
    });
    await db.update(schema.bookings).set({ stripeCheckoutSessionId: session.id }).where(eq(schema.bookings.id, b.id));
    return session.url!;
  }

  // ---------- Limpieza suelta, profunda o mudanza (pago al reservar) ----------
  const q = quote(input.service, input.bedrooms, input.extras);
  const [b] = await db
    .insert(schema.bookings)
    .values({
      userId: user.id,
      propertyId: property.id,
      service: input.service,
      bedrooms: input.bedrooms,
      extras: input.extras,
      date: input.date,
      timeSlot: input.timeSlot,
      priceCents: toCents(q.dueNow),
      customerNotes: input.notes?.trim() || null,
    })
    .returning();
  if (demo.payments) {
    await confirmBookingPaid(b.id, null);
    return `${success}?demo=1`;
  }
  const customer = await ensureCustomer(user);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    locale: lang,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: b.priceCents,
          product_data: {
            name: `${SERVICE_NAMES[input.service][lang]} · ${input.bedrooms} ${lang === "en" ? "bd" : "hab"}`,
            description: formatDate(input.date, lang),
          },
        },
      },
    ],
    payment_intent_data: { metadata: { bookingId: b.id } },
    metadata: { kind: "booking", bookingId: b.id },
    success_url: `${success}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  });
  await db.update(schema.bookings).set({ stripeCheckoutSessionId: session.id }).where(eq(schema.bookings.id, b.id));
  return session.url!;
}

// ---------------- Confirmaciones (las llama el webhook de Stripe o el modo demo) ----------------

export async function confirmBookingPaid(bookingId: string, paymentIntentId: string | null) {
  const db = await getDb();
  const [b] = await db
    .update(schema.bookings)
    .set({ status: "scheduled", paymentStatus: "paid", stripePaymentIntentId: paymentIntentId })
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.status, "pending_payment")))
    .returning();
  if (b) await sendBookingConfirmed(b.id);
}

export async function confirmHostCard(bookingId: string, customerId: string, paymentMethodId: string) {
  const db = await getDb();
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  if (!b) return;
  await db
    .update(schema.users)
    .set({ stripeCustomerId: customerId, stripePaymentMethodId: paymentMethodId })
    .where(eq(schema.users.id, b.userId));
  const [updated] = await db
    .update(schema.bookings)
    .set({ status: "scheduled" })
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.status, "pending_payment")))
    .returning();
  if (updated) await sendBookingConfirmed(updated.id);
}

/** Guarda una tarjeta nueva para Host sin reserva asociada (desde la cuenta del cliente). */
export async function saveHostCard(userId: string, customerId: string, paymentMethodId: string) {
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ stripeCustomerId: customerId, stripePaymentMethodId: paymentMethodId })
    .where(eq(schema.users.id, userId));
  // Reintenta los turnovers que fallaron
  const failed = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.userId, userId), eq(schema.bookings.paymentStatus, "failed")));
  for (const b of failed) await chargeHostBooking(b.id);
}

export async function activateSubscription(subscriptionId: string, stripeSubscriptionId: string | null) {
  const db = await getDb();
  const [sub] = await db
    .update(schema.subscriptions)
    .set({ status: "active", stripeSubscriptionId })
    .where(and(eq(schema.subscriptions.id, subscriptionId), eq(schema.subscriptions.status, "pending")))
    .returning();
  if (!sub) return;
  await ensureVisits(sub);
  const user = await getUser(sub.userId);
  const lang = asLocale(user.locale);
  await sendEmail({
    to: user.email,
    subject: lang === "en" ? "Welcome to Clara" : "Bienvenido a Clara",
    heading: lang === "en" ? `Your ${SERVICE_NAMES[sub.plan][lang]} plan is active` : `Tu plan ${SERVICE_NAMES[sub.plan][lang]} está activo`,
    paragraphs: [
      lang === "en"
        ? `First visit: ${formatDate(sub.startDate, lang)}, ${TIME_SLOTS[sub.timeSlot as TimeSlot][lang]}.`
        : `Primera visita: ${formatDate(sub.startDate, lang)}, ${TIME_SLOTS[sub.timeSlot as TimeSlot][lang]}.`,
      lang === "en"
        ? "Every visit is recorded on video (no audio). You'll find the videos in your account for 30 days."
        : "Cada visita se graba en video (sin audio). Vas a ver los videos en tu cuenta durante 30 días.",
    ],
    button: { label: lang === "en" ? "Go to my account" : "Ir a mi cuenta", url: `${env.appUrl}/cuenta` },
  });
}

/** Crea las visitas del plan para las próximas semanas. Se puede llamar todas las veces que haga falta. */
export async function ensureVisits(sub: Subscription) {
  if (sub.status !== "active") return;
  const db = await getDb();
  const today = todayISO();
  const through = addDays(today, SUBSCRIPTION_HORIZON_DAYS);
  const from = sub.scheduledThrough ? addDays(sub.scheduledThrough, 1) : sub.startDate;
  const visits = planVisits(sub.plan as "essential" | "plus", sub.startDate, from < today ? today : from, through);
  if (visits.length) {
    await db
      .insert(schema.bookings)
      .values(
        visits.map((v) => ({
          userId: sub.userId,
          propertyId: sub.propertyId,
          subscriptionId: sub.id,
          service: v.service,
          bedrooms: sub.bedrooms,
          extras: sub.extras,
          date: v.date,
          timeSlot: sub.timeSlot,
          status: "scheduled",
          priceCents: 0,
          paymentStatus: "included",
        })),
      )
      .onConflictDoNothing();
  }
  await db.update(schema.subscriptions).set({ scheduledThrough: through }).where(eq(schema.subscriptions.id, sub.id));
}

export async function setSubscriptionStatus(stripeSubscriptionId: string, status: "active" | "past_due" | "canceled") {
  const db = await getDb();
  const [sub] = await db
    .update(schema.subscriptions)
    .set({ status, ...(status === "canceled" ? { canceledAt: new Date() } : {}) })
    .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .returning();
  if (!sub) return;
  if (status === "canceled") {
    await db
      .update(schema.bookings)
      .set({ status: "canceled" })
      .where(
        and(
          eq(schema.bookings.subscriptionId, sub.id),
          eq(schema.bookings.status, "scheduled"),
          gt(schema.bookings.date, todayISO()),
        ),
      );
  }
  if (status === "past_due") {
    const user = await getUser(sub.userId);
    const lang = asLocale(user.locale);
    await sendEmail({
      to: user.email,
      subject: lang === "en" ? "We couldn't process your payment" : "No pudimos cobrar tu plan",
      heading: lang === "en" ? "Please update your card" : "Actualizá tu tarjeta",
      paragraphs: [
        lang === "en"
          ? "Your monthly payment didn't go through. Update your card so your cleanings keep going."
          : "No pudimos cobrar el mes de tu plan. Actualizá la tarjeta para que sigan tus limpiezas.",
      ],
      button: { label: lang === "en" ? "Update card" : "Actualizar tarjeta", url: `${env.appUrl}/cuenta` },
    });
  }
  if (status === "active") await ensureVisits(sub);
}

// ---------------- Acciones sobre una limpieza ----------------

/** Cobra un turnover Host con la tarjeta guardada. */
export async function chargeHostBooking(bookingId: string): Promise<"paid" | "failed" | "skipped"> {
  const db = await getDb();
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  if (!b || b.service !== "host" || !["to_charge", "failed"].includes(b.paymentStatus)) return "skipped";
  const user = await getUser(b.userId);
  if (demo.payments) {
    await db.update(schema.bookings).set({ paymentStatus: "paid" }).where(eq(schema.bookings.id, b.id));
    return "paid";
  }
  if (!user.stripeCustomerId || !user.stripePaymentMethodId) {
    await db.update(schema.bookings).set({ paymentStatus: "failed" }).where(eq(schema.bookings.id, b.id));
    return "failed";
  }
  try {
    const pi = await stripe().paymentIntents.create(
      {
        amount: b.priceCents,
        currency: "usd",
        customer: user.stripeCustomerId,
        payment_method: user.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description: `Clara Host · ${b.date}`,
        metadata: { bookingId: b.id },
      },
      { idempotencyKey: `host-${b.id}-${b.paymentStatus === "failed" ? Date.now() : "first"}` },
    );
    const ok = pi.status === "succeeded" || pi.status === "processing";
    await db
      .update(schema.bookings)
      .set({ paymentStatus: ok ? "paid" : "failed", stripePaymentIntentId: pi.id })
      .where(eq(schema.bookings.id, b.id));
    if (!ok) await sendCardFailed(user, b);
    return ok ? "paid" : "failed";
  } catch (e) {
    console.error("Cobro Host falló", e);
    await db.update(schema.bookings).set({ paymentStatus: "failed" }).where(eq(schema.bookings.id, b.id));
    await sendCardFailed(user, b);
    return "failed";
  }
}

async function sendCardFailed(user: User, b: Booking) {
  const lang = asLocale(user.locale);
  await sendEmail({
    to: user.email,
    subject: lang === "en" ? "We couldn't charge your turnover" : "No pudimos cobrar el turnover",
    heading: lang === "en" ? "Please update your card" : "Actualizá tu tarjeta",
    paragraphs: [
      lang === "en"
        ? `We couldn't charge ${formatUSD(b.priceCents)} for the turnover on ${formatDate(b.date, lang)}.`
        : `No pudimos cobrar ${formatUSD(b.priceCents)} del turnover del ${formatDate(b.date, lang)}.`,
    ],
    button: { label: lang === "en" ? "Update card" : "Actualizar tarjeta", url: `${env.appUrl}/cuenta` },
  });
}

/** Cancelación pedida por el cliente (con 24 h de aviso). Devuelve el pago si correspondía. */
export async function cancelByCustomer(userId: string, bookingId: string): Promise<"ok" | "too_late" | "not_found"> {
  const db = await getDb();
  const [b] = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.userId, userId)));
  if (!b || !["scheduled", "pending_payment"].includes(b.status)) return "not_found";
  if (!canCustomerCancel(b.date, b.timeSlot)) return "too_late";
  await cancelBooking(b, { refund: true });
  return "ok";
}

export async function cancelBooking(b: Booking, opts: { refund: boolean }) {
  const db = await getDb();
  let paymentStatus = b.paymentStatus;
  if (opts.refund && b.paymentStatus === "paid" && b.stripePaymentIntentId && !demo.payments) {
    await stripe().refunds.create({ payment_intent: b.stripePaymentIntentId }, { idempotencyKey: `refund-${b.id}` });
    paymentStatus = "refunded";
  } else if (opts.refund && b.paymentStatus === "paid") {
    paymentStatus = "refunded";
  } else if (b.paymentStatus === "to_charge") {
    paymentStatus = "unpaid";
  }
  await db.update(schema.bookings).set({ status: "canceled", paymentStatus }).where(eq(schema.bookings.id, b.id));
}

export async function sendBookingConfirmed(bookingId: string) {
  const db = await getDb();
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  if (!b) return;
  const user = await getUser(b.userId);
  const lang = asLocale(user.locale);
  const [p] = await db.select().from(schema.properties).where(eq(schema.properties.id, b.propertyId));
  await sendEmail({
    to: user.email,
    subject: lang === "en" ? "Your Clara cleaning is confirmed" : "Tu limpieza con Clara está confirmada",
    heading: lang === "en" ? "Booking confirmed" : "Reserva confirmada",
    paragraphs: [
      `${SERVICE_NAMES[b.service][lang]} · ${formatDate(b.date, lang)} · ${TIME_SLOTS[b.timeSlot as TimeSlot][lang]}`,
      `${p.address}${p.unit ? `, ${p.unit}` : ""}`,
      b.service === "host"
        ? lang === "en"
          ? `${formatUSD(b.priceCents)} will be charged to your card once the turnover is done.`
          : `Cobramos ${formatUSD(b.priceCents)} a tu tarjeta cuando terminemos el turnover.`
        : lang === "en"
          ? `Paid: ${formatUSD(b.priceCents)}.`
          : `Pagado: ${formatUSD(b.priceCents)}.`,
      lang === "en"
        ? "The service is recorded on video (no audio). You'll see it in your account."
        : "El servicio se graba en video (sin audio). Lo vas a ver en tu cuenta.",
    ],
    button: { label: lang === "en" ? "Go to my account" : "Ir a mi cuenta", url: `${env.appUrl}/cuenta` },
  });
}

/** Recordatorio para las limpiezas de mañana. */
export async function sendReminders() {
  const db = await getDb();
  const tomorrow = addDays(todayISO(), 1);
  const rows = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.date, tomorrow), eq(schema.bookings.status, "scheduled")));
  let sent = 0;
  for (const b of rows) {
    if (b.reminderSentAt) continue;
    const user = await getUser(b.userId);
    const lang = asLocale(user.locale);
    await sendEmail({
      to: user.email,
      subject: lang === "en" ? "Your cleaning is tomorrow" : "Mañana es tu limpieza",
      heading: lang === "en" ? "See you tomorrow" : "Nos vemos mañana",
      paragraphs: [
        `${SERVICE_NAMES[b.service][lang]} · ${formatDate(b.date, lang)} · ${TIME_SLOTS[b.timeSlot as TimeSlot][lang]}`,
        lang === "en"
          ? "Please make sure we can get in. If something changed, reply to this email."
          : "Asegurate de que podamos entrar. Si cambió algo, respondé este email.",
      ],
    });
    await db.update(schema.bookings).set({ reminderSentAt: new Date() }).where(eq(schema.bookings.id, b.id));
    sent++;
  }
  return sent;
}

/** Extiende el calendario de todos los planes activos. */
export async function extendAllSubscriptions() {
  const db = await getDb();
  const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.status, "active"));
  for (const s of subs) await ensureVisits(s);
  return subs.length;
}

export async function getUser(id: string): Promise<User> {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) throw new Error("Usuario no encontrado");
  return u;
}


export async function startBooking(bookingId: string) {
  const db = await getDb();
  await db
    .update(schema.bookings)
    .set({ status: "in_progress", startedAt: new Date() })
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.status, "scheduled")));
}

/** Marca la limpieza como terminada. Si es Host, cobra el turnover. */
export async function completeBooking(bookingId: string) {
  const db = await getDb();
  const [b] = await db
    .update(schema.bookings)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(schema.bookings.id, bookingId), inArrayStatus(["scheduled", "in_progress"])))
    .returning();
  if (b?.service === "host") await chargeHostBooking(b.id);
  return b;
}

function inArrayStatus(statuses: string[]) {
  return inArray(schema.bookings.status, statuses);
}
