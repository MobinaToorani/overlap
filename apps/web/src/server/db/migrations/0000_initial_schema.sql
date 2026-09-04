CREATE TYPE "public"."member_role_t" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."night_state_t" AS ENUM('confirmed_free', 'no_known_conflict', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."plan_status_t" AS ENUM('draft', 'live', 'happened', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status_t" AS ENUM('going', 'maybe', 'out');--> statement-breakpoint
CREATE TYPE "public"."vibe_t" AS ENUM('down_for_anything', 'low_key', 'slammed', 'broke', 'out_of_town');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"poke_muted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "busy_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'calendar' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"sync_status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_member" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role_t" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_member_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"created_by" uuid NOT NULL,
	"signal_dow" smallint DEFAULT 0 NOT NULL,
	"signal_hour" smallint DEFAULT 19 NOT NULL,
	"cadence_weeks" smallint DEFAULT 1 NOT NULL,
	"join_code" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grp_join_code_unique" UNIQUE("join_code"),
	CONSTRAINT "cadence_weeks_check" CHECK ("grp"."cadence_weeks" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text,
	"attachment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"rank" smallint NOT NULL,
	"channel" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"dropped_reason" text,
	CONSTRAINT "notification_log_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location_text" text,
	"is_home_hang" boolean DEFAULT false NOT NULL,
	"cover_asset" text,
	"status" "plan_status_t" DEFAULT 'live' NOT NULL,
	"public_slug" text NOT NULL,
	"attendance_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poke" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"context_date" date,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rsvp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid,
	"guest_name" text,
	"status" "rsvp_status_t" NOT NULL,
	"plus_ones" smallint DEFAULT 0 NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvp_user_or_guest_check" CHECK ("rsvp"."user_id" IS NOT NULL OR "rsvp"."guest_name" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"week_start_date" date NOT NULL,
	"vibe" "vibe_t" NOT NULL,
	"note" varchar(140),
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signal_night" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"state" "night_state_t" NOT NULL,
	"horizon_week" smallint NOT NULL,
	"confirmed_at" timestamp with time zone,
	"written_by" text NOT NULL,
	CONSTRAINT "horizon_week_check" CHECK ("signal_night"."horizon_week" BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "someday_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"price_cents" integer,
	"note" text,
	"claimed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_user" ADD CONSTRAINT "app_user_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "busy_block" ADD CONSTRAINT "busy_block_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_grp_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."grp"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_member" ADD CONSTRAINT "group_member_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grp" ADD CONSTRAINT "grp_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message" ADD CONSTRAINT "message_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan" ADD CONSTRAINT "plan_group_id_grp_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."grp"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan" ADD CONSTRAINT "plan_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poke" ADD CONSTRAINT "poke_group_id_grp_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."grp"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poke" ADD CONSTRAINT "poke_sender_id_app_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poke" ADD CONSTRAINT "poke_recipient_id_app_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rsvp" ADD CONSTRAINT "rsvp_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rsvp" ADD CONSTRAINT "rsvp_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signal" ADD CONSTRAINT "signal_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signal" ADD CONSTRAINT "signal_group_id_grp_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."grp"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signal_night" ADD CONSTRAINT "signal_night_signal_id_signal_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signal"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "someday_item" ADD CONSTRAINT "someday_item_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "someday_item" ADD CONSTRAINT "someday_item_claimed_by_app_user_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_busy_user_time" ON "busy_block" USING btree ("user_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_connection_user_provider_uq" ON "calendar_connection" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_budget" ON "notification_log" USING btree ("user_id","dispatched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_poke_rate" ON "poke" USING btree ("recipient_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_signal_global" ON "signal" USING btree ("user_id","week_start_date") WHERE "signal"."group_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_signal_scoped" ON "signal" USING btree ("user_id","group_id","week_start_date") WHERE "signal"."group_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signal_night_signal_date_uq" ON "signal_night" USING btree ("signal_id","date");