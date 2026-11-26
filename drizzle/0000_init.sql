CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"subscription_id" uuid,
	"service" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"date" date NOT NULL,
	"time_slot" text NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"price_cents" integer NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"cleaner_id" uuid,
	"customer_notes" text,
	"internal_notes" text,
	"reminder_sent_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"next" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"unit" text,
	"zip" text NOT NULL,
	"zone" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"access_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weekday" integer NOT NULL,
	"time_slot" text NOT NULL,
	"start_date" date NOT NULL,
	"scheduled_through" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_subscription_id" text,
	"stripe_checkout_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"role" text DEFAULT 'client' NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"stripe_customer_id" text,
	"stripe_payment_method_id" text,
	"host_intro_used" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"duration_seconds" integer,
	"size_bytes" bigint,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cleaner_id_users_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_user_idx" ON "bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookings_date_idx" ON "bookings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "bookings_cleaner_idx" ON "bookings" USING btree ("cleaner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_sub_date_idx" ON "bookings" USING btree ("subscription_id","date");--> statement-breakpoint
CREATE INDEX "properties_user_idx" ON "properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "videos_booking_idx" ON "videos" USING btree ("booking_id");