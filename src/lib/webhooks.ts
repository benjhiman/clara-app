import "server-only";
import type Stripe from "stripe";
import { stripe } from "./stripe";
import {
  activateSubscription,
  confirmBookingPaid,
  confirmHostCard,
  saveHostCard,
  setSubscriptionStatus,
} from "./bookings";

/** Procesa un Checkout terminado. Es seguro llamarlo más de una vez. */
export async function handleCheckoutCompleted(s: Stripe.Checkout.Session) {
  const kind = s.metadata?.kind;
  if (kind === "booking" && s.payment_status === "paid") {
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
    await confirmBookingPaid(s.metadata!.bookingId, pi);
  } else if (kind === "subscription") {
    const subId = typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null);
    await activateSubscription(s.metadata!.subscriptionId, subId);
  } else if (kind === "host_setup" || kind === "host_card") {
    const setupId = typeof s.setup_intent === "string" ? s.setup_intent : s.setup_intent?.id;
    if (!setupId) return;
    const si = await stripe().setupIntents.retrieve(setupId);
    const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
    const customer = typeof s.customer === "string" ? s.customer : s.customer?.id;
    if (!pm || !customer) return;
    await stripe().customers.update(customer, { invoice_settings: { default_payment_method: pm } });
    if (kind === "host_setup") await confirmHostCard(s.metadata!.bookingId, customer, pm);
    else await saveHostCard(s.metadata!.userId, customer, pm);
  }
}

export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object);
      break;
    case "invoice.paid": {
      const sub = subscriptionIdOf(event.data.object);
      if (sub) await setSubscriptionStatus(sub, "active");
      break;
    }
    case "invoice.payment_failed": {
      const sub = subscriptionIdOf(event.data.object);
      if (sub) await setSubscriptionStatus(sub, "past_due");
      break;
    }
    case "customer.subscription.deleted":
      await setSubscriptionStatus(event.data.object.id, "canceled");
      break;
  }
}

function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  // En las versiones nuevas de la API el id está en parent.subscription_details
  const anyInv = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  };
  const s = anyInv.parent?.subscription_details?.subscription ?? anyInv.subscription;
  if (!s) return null;
  return typeof s === "string" ? s : s.id;
}
