import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser, homeFor, safeNext } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Header from "../components/Header";
import LoginForm from "./LoginForm";
import { demo } from "@/lib/env";
import { demoLogin } from "./actions";

const DEMO_BUTTONS = [
  { role: "client", label: "Cliente con plan (Valentina)" },
  { role: "host", label: "Host de Airbnb (Carlos)" },
  { role: "family", label: "Cliente con limpieza y video (Ana)" },
  { role: "cleaner", label: "Limpiadora (María)" },
  { role: "admin", label: "Socio (panel de admin)" },
] as const;

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (user && !demo.public) redirect(safeNext(sp.next) ?? homeFor(user.role));
  const locale = await getLocale();
  const d = t(locale);
  return (
    <>
      <Header locale={locale} path="/entrar" />
      <main className="wrap" style={{ maxWidth: 460 }}>
        <div className="card">
          <h1>{d.loginTitle}</h1>
          <p className="muted">{d.loginBody}</p>
          {sp.error && <p className="notice bad">{d.badLink}</p>}
          {demo.public && (
            <div className="notice" style={{ marginBottom: 20 }}>
              <strong>Demo:</strong> entrá con un toque como alguno de estos usuarios de ejemplo.
              <div className="stack" style={{ marginTop: 12 }}>
                {DEMO_BUTTONS.map((b) => (
                  <form key={b.role} action={demoLogin.bind(null, b.role)}>
                    <button className="btn ghost block">{b.label}</button>
                  </form>
                ))}
              </div>
            </div>
          )}
          <LoginForm next={safeNext(sp.next) ?? ""} labels={{ email: d.email, sendLink: d.sendLink, linkSent: d.linkSent, errEmail: d.errors.email }} />
        </div>
      </main>
    </>
  );
}
