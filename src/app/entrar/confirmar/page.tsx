import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Header from "../../components/Header";
import { confirmLogin } from "../actions";

// Pedimos un toque extra para que los antivirus de email que abren links no "gasten" el link.
export default async function ConfirmarPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const locale = await getLocale();
  const d = t(locale);
  return (
    <>
      <Header locale={locale} path="/entrar" showLang={false} />
      <main className="wrap" style={{ maxWidth: 460 }}>
        <div className="card">
          <h1>{d.confirmLogin}</h1>
          <p className="muted">{d.confirmLoginBody}</p>
          <form action={confirmLogin}>
            <input type="hidden" name="token" value={token ?? ""} />
            <button className="btn block">{d.signIn}</button>
          </form>
        </div>
      </main>
    </>
  );
}
