"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { cancelByCustomer } from "@/lib/bookings";
import { demo, env } from "@/lib/env";
import { ensureCustomer, stripe } from "@/lib/stripe";
import { getLocale } from "@/lib/locale";

export async function cancelAction(bookingId: string) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const res = await cancelByCustomer(user.id, bookingId);
  revalidatePath("/cuenta");
  redirect(`/cuenta?cancel=${res}`);
}

export async function billingPortalAction() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (demo.payments || !user.stripeCustomerId) redirect("/cuenta?demo=portal");
  const s = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.appUrl}/cuenta`,
    locale: await getLocale(),
  });
  redirect(s.url);
}

export async function updateCardAction() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (demo.payments) redirect("/cuenta?demo=portal");
  const customer = await ensureCustomer(user);
  const s = await stripe().checkout.sessions.create({
    mode: "setup",
    customer,
    currency: "usd",
    locale: await getLocale(),
    metadata: { kind: "host_card", userId: user.id },
    success_url: `${env.appUrl}/cuenta?tarjeta=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/cuenta`,
  });
  redirect(s.url!);
}
