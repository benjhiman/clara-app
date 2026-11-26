import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { demo } from "@/lib/env";
import { t, type Locale } from "@/lib/i18n";
import { logout, setLang } from "../actions";

export default async function Header({ locale, path, showLang = true }: { locale: Locale; path: string; showLang?: boolean }) {
  const user = await currentUser();
  const d = t(locale);
  const demoParts = [demo.payments && "pagos", demo.email && "emails", demo.video && "videos"].filter(Boolean);
  return (
    <>
      {demo.public ? (
        <div className="demo-banner">
          Demo con datos de ejemplo: no se cobra ni se envía nada. <Link href="/entrar" style={{ color: "#FF7A59" }}>Cambiar de usuario</Link>
        </div>
      ) : demoParts.length > 0 && (
        <div className="demo-banner">Modo demo: {demoParts.join(", ")} de prueba. Nada se cobra ni se envía de verdad.</div>
      )}
      <header className="top">
        <div className="wrap top-in">
          <Link href="/reservar" aria-label="Clara">
            <img src="/logo.svg" alt="Clara" />
          </Link>
          <nav>
            {user?.role === "admin" && <Link href="/admin">Admin</Link>}
            {(user?.role === "cleaner" || user?.role === "admin") && <Link href="/limpiador">Limpiador</Link>}
            {user?.role === "client" && <Link href="/reservar">{d.book}</Link>}
            {user ? <Link href="/cuenta">{d.myAccount}</Link> : <Link href="/entrar">{d.signIn}</Link>}
            {showLang && (
              <form action={setLang.bind(null, locale === "es" ? "en" : "es", path)}>
                <button className="btn ghost sm" type="submit" aria-label="Language">
                  {locale === "es" ? "EN" : "ES"}
                </button>
              </form>
            )}
            {user && (
              <form action={logout}>
                <button className="btn ghost sm hide-sm" type="submit">
                  {d.signOut}
                </button>
              </form>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
