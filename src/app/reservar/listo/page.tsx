import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { demo } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/lib/webhooks";
import Header from "../../components/Header";

export default async function ListoPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const locale = await getLocale();
  const d = t(locale);
  let confirmed = demo.payments;
  if (!demo.payments && session_id) {
    // Confirmamos acá también por si el webhook tarda (es idempotente)
    try {
      const s = await stripe().checkout.sessions.retrieve(session_id);
      if (s.status === "complete") {
        await handleCheckoutCompleted(s);
        confirmed = true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return (
    <>
      <Header locale={locale} path="/reservar/listo" />
      <main className="wrap narrow">
        <div className="card">
          <h1>{d.thanksTitle}</h1>
          <p>{confirmed ? d.thanksBody : d.thanksPending}</p>
          <p className="muted small">
            {locale === "en"
              ? "To see your account, sign in with the same email. We'll send you a link."
              : "Para entrar a tu cuenta usá el mismo email: te mandamos un link."}
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn" href="/cuenta">
              {d.goToAccount}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
