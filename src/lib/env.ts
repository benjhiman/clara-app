import "server-only";

export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: process.env.SESSION_SECRET ?? "",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  stripeKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  resendKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Clara <hola@claracleanmiami.com>",
  cfAccount: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
  cfStreamToken: process.env.CLOUDFLARE_STREAM_TOKEN ?? "",
  cfCustomerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE ?? "",
  cfWebhookSecret: process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  isProd: process.env.NODE_ENV === "production",
};

export const demo = {
  /** Demo pública con datos de ejemplo y botones para entrar sin email. Nunca en la versión real. */
  public: process.env.DEMO_PUBLIC === "1" && !process.env.STRIPE_SECRET_KEY,
  payments: !env.stripeKey,
  email: !env.resendKey,
  video: !(env.cfAccount && env.cfStreamToken),
};

export function sessionKey(): Uint8Array {
  const s = env.sessionSecret || (env.isProd ? "" : "clara-dev-secret-no-usar-en-produccion");
  if (s.length < 32 && env.isProd) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(s.padEnd(32, "_"));
}
