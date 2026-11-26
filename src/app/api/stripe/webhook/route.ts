import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { handleStripeEvent } from "@/lib/webhooks";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig || !env.stripeWebhookSecret) return NextResponse.json({ error: "sin firma" }, { status: 400 });
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "firma inválida" }, { status: 400 });
  }
  try {
    await handleStripeEvent(event);
  } catch (e) {
    console.error("Error procesando webhook de Stripe", event.type, e);
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
