import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  uuid,
  boolean,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    // client | cleaner | admin
    role: text("role").notNull().default("client"),
    locale: text("locale").notNull().default("es"),
    stripeCustomerId: text("stripe_customer_id"),
    // Tarjeta guardada para Clara Host (cobro por turnover)
    stripePaymentMethodId: text("stripe_payment_method_id"),
    // Ya usó el primer turnover Host al 50%
    hostIntroUsed: boolean("host_intro_used").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  next: text("next"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    address: text("address").notNull(),
    unit: text("unit"),
    zip: text("zip").notNull(),
    zone: text("zone").notNull(),
    bedrooms: integer("bedrooms").notNull(),
    // Cómo entrar: código, portería, llave, etc.
    accessNotes: text("access_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("properties_user_idx").on(t.userId)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    // essential | plus
    plan: text("plan").notNull(),
    bedrooms: integer("bedrooms").notNull(),
    priceCents: integer("price_cents").notNull(),
    extras: jsonb("extras").$type<string[]>().notNull().default([]),
    // 0=domingo ... 6=sábado
    weekday: integer("weekday").notNull(),
    timeSlot: text("time_slot").notNull(),
    startDate: date("start_date").notNull(),
    // Última fecha hasta la que ya se crearon visitas
    scheduledThrough: date("scheduled_through"),
    // pending | active | past_due | canceled
    status: text("status").notNull().default("pending"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    // single | deep | move | host | essential | plus | plus_deep
    service: text("service").notNull(),
    bedrooms: integer("bedrooms").notNull(),
    extras: jsonb("extras").$type<string[]>().notNull().default([]),
    date: date("date").notNull(),
    timeSlot: text("time_slot").notNull(),
    // pending_payment | scheduled | in_progress | completed | canceled
    status: text("status").notNull().default("pending_payment"),
    priceCents: integer("price_cents").notNull(),
    // unpaid | paid | included | to_charge | failed | refunded
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    cleanerId: uuid("cleaner_id").references(() => users.id),
    customerNotes: text("customer_notes"),
    internalNotes: text("internal_notes"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_user_idx").on(t.userId),
    index("bookings_date_idx").on(t.date),
    index("bookings_cleaner_idx").on(t.cleanerId),
    uniqueIndex("bookings_sub_date_idx").on(t.subscriptionId, t.date),
  ],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    // stream | local
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    // uploading | processing | ready | error | deleted
    status: text("status").notNull().default("uploading"),
    durationSeconds: integer("duration_seconds"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("videos_booking_idx").on(t.bookingId)],
);

export type User = typeof users.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Video = typeof videos.$inferSelect;
