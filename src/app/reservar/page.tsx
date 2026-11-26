import type { Metadata } from "next";
import { desc, eq, and, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { isService } from "@/lib/pricing";
import { t } from "@/lib/i18n";
import Header from "../components/Header";
import BookingForm, { type Prefill } from "./BookingForm";

export const metadata: Metadata = { title: "Reservar" };

export default async function ReservarPage({ searchParams }: { searchParams: Promise<{ servicio?: string; lang?: string; cancelado?: string }> }) {
  const sp = await searchParams;
  const locale = sp.lang === "en" || sp.lang === "es" ? sp.lang : await getLocale();
  const user = await currentUser();
  const prefill: Prefill = { hostIntroAvailable: true };
  if (user) {
    const db = await getDb();
    const [prop] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.userId, user.id))
      .orderBy(desc(schema.properties.createdAt))
      .limit(1);
    const hostBookings = await db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.userId, user.id), eq(schema.bookings.service, "host"), ne(schema.bookings.status, "canceled")))
      .limit(1);
    Object.assign(prefill, {
      name: user.name ?? "",
      email: user.email,
      phone: user.phone ?? "",
      address: prop?.address,
      unit: prop?.unit ?? "",
      zip: prop?.zip,
      accessNotes: prop?.accessNotes ?? "",
      hostIntroAvailable: !user.hostIntroUsed && hostBookings.length === 0,
    });
  }
  const initial = sp.servicio && isService(sp.servicio) ? sp.servicio : undefined;
  return (
    <>
      <Header locale={locale} path="/reservar" />
      <main className="wrap narrow">
        <h1>{t(locale).book}</h1>
        {sp.cancelado && (
          <p className="notice warn">
            {locale === "en" ? "The payment wasn't completed. You can try again." : "El pago no se completó. Podés intentar de nuevo."}
          </p>
        )}
        <BookingForm locale={locale} prefill={prefill} initialService={initial} />
      </main>
    </>
  );
}
