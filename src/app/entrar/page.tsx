import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser, homeFor, safeNext } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Header from "../components/Header";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (user) redirect(safeNext(sp.next) ?? homeFor(user.role));
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
          <LoginForm next={safeNext(sp.next) ?? ""} labels={{ email: d.email, sendLink: d.sendLink, linkSent: d.linkSent, errEmail: d.errors.email }} />
        </div>
      </main>
    </>
  );
}
