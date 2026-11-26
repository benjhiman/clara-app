"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DEMO_USERS } from "@/db/seed";
import { consumeLoginToken, createLoginToken, homeFor, normalizeEmail, safeNext, startSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { demo, env } from "@/lib/env";
import { getLocale } from "@/lib/locale";

export type LoginState = { sent?: boolean; error?: string; devLink?: string };

const recent = new Map<string, number>();

export async function requestLink(_: LoginState, form: FormData): Promise<LoginState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const next = safeNext(String(form.get("next") ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "email" };
  // Freno simple: un link por email cada 30 segundos
  const last = recent.get(email) ?? 0;
  if (Date.now() - last < 30_000) return { sent: true };
  recent.set(email, Date.now());
  const link = await createLoginToken(email, next);
  const lang = await getLocale();
  await sendEmail({
    to: email,
    subject: lang === "en" ? "Your link to sign in to Clara" : "Tu link para entrar a Clara",
    heading: lang === "en" ? "Sign in to Clara" : "Entrá a Clara",
    paragraphs: [
      lang === "en"
        ? "Tap the button to sign in. The link expires in 30 minutes and works once."
        : "Tocá el botón para entrar. El link vence en 30 minutos y sirve una sola vez.",
      lang === "en" ? "If you didn't ask for it, ignore this email." : "Si no lo pediste, ignorá este email.",
    ],
    button: { label: lang === "en" ? "Sign in" : "Entrar", url: link },
  });
  // En la compu de desarrollo, sin servicio de email, mostramos el link en pantalla.
  return { sent: true, devLink: demo.email && (!env.isProd || demo.public) ? link : undefined };
}

/** Demo pública: entrar con un toque como uno de los usuarios de ejemplo. */
export async function demoLogin(role: keyof typeof DEMO_USERS) {
  if (!demo.public || !(role in DEMO_USERS)) redirect("/entrar");
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USERS[role]));
  if (!u) redirect("/entrar");
  await startSession(u);
  redirect(homeFor(u.role));
}

export async function confirmLogin(form: FormData) {
  const token = String(form.get("token") ?? "");
  const res = token ? await consumeLoginToken(token) : null;
  if (!res) redirect("/entrar?error=link");
  redirect(res.next ?? homeFor(res.user.role));
}
