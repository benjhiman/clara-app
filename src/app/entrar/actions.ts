"use server";
import { redirect } from "next/navigation";
import { consumeLoginToken, createLoginToken, homeFor, normalizeEmail, safeNext } from "@/lib/auth";
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
  return { sent: true, devLink: demo.email && !env.isProd ? link : undefined };
}

export async function confirmLogin(form: FormData) {
  const token = String(form.get("token") ?? "");
  const res = token ? await consumeLoginToken(token) : null;
  if (!res) redirect("/entrar?error=link");
  redirect(res.next ?? homeFor(res.user.role));
}
