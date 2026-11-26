import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { env } from "./env";

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!env.stripeKey) throw new Error("Falta STRIPE_SECRET_KEY");
  if (!client) client = new Stripe(env.stripeKey);
  return client;
}

export async function ensureCustomer(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const c = await stripe().customers.create(
    { email: user.email, name: user.name ?? undefined, phone: user.phone ?? undefined, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  const db = await getDb();
  await db.update(schema.users).set({ stripeCustomerId: c.id }).where(eq(schema.users.id, user.id));
  user.stripeCustomerId = c.id;
  return c.id;
}

const LAUNCH_COUPON = "CLARA_LANZAMIENTO_25";
export async function launchCoupon(): Promise<string> {
  try {
    await stripe().coupons.retrieve(LAUNCH_COUPON);
  } catch {
    await stripe().coupons.create({
      id: LAUNCH_COUPON,
      percent_off: 25,
      duration: "once",
      name: "Lanzamiento: 25% el primer mes",
    });
  }
  return LAUNCH_COUPON;
}
