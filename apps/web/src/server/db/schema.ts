/**
 * Postgres schema via Drizzle. Source of truth: docs/engineering-spec.md §3.
 *
 * Two invariants are NOT expressible in Drizzle's table builder and live in
 * ./sql/0001_guard_invariants.sql instead, applied after `drizzle-kit
 * generate` migrations: the guard_confirmed_free / guard_worker_role
 * triggers (INV-1) and the overlap_worker role grant. Don't remove them —
 * they're the real enforcement boundary, not this file's column types.
 */
import { VIBES, NIGHT_STATES } from '@overlap/shared';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Minimal reference into Supabase's managed auth schema — just enough to
// foreign-key against it. Do not add columns here; auth.users is owned by
// Supabase Auth, not by this schema. FIX-1: app_user.id MUST reference this,
// never an independently generated uuid.
//
// Deliberately NOT exported. `drizzle-kit generate` finds tables by
// scanning this module's exports, so an exported authUsers gets treated as
// a table THIS schema owns and creates — producing a migration with
// `CREATE TABLE "auth"."users"` and no `CREATE SCHEMA "auth"` first, which
// fails against a fresh non-Supabase Postgres and, even against Supabase,
// asserts a one-column table that isn't what Supabase actually provisions.
// Keeping this unexported still lets appUser's `.references()` below
// resolve it (same module) while hiding it from drizzle-kit entirely — the
// generated migration correctly emits the FK constraint
// (`REFERENCES "auth"."users"("id")`) without trying to create the table.
const authSchema = pgSchema('auth');
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

export const vibeEnum = pgEnum('vibe_t', VIBES);
export const nightStateEnum = pgEnum('night_state_t', NIGHT_STATES);
export const planStatusEnum = pgEnum('plan_status_t', [
  'draft',
  'live',
  'happened',
  'cancelled',
]);
export const rsvpStatusEnum = pgEnum('rsvp_status_t', ['going', 'maybe', 'out']);
export const memberRoleEnum = pgEnum('member_role_t', ['member', 'admin']);

export const appUser = pgTable('app_user', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  phoneE164: text('phone_e164').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  timezone: text('timezone').notNull().default('America/Toronto'),
  pokeMutedUntil: timestamp('poke_muted_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const grp = pgTable('grp', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => appUser.id),
  signalDow: smallint('signal_dow').notNull().default(0), // 0 = Sunday
  signalHour: smallint('signal_hour').notNull().default(19),
  // FIX-7: step DOWN to 2 after 3 consecutive weeks with <40% completion AND
  // zero plans created; step UP to 1 immediately on any plan creation; never
  // below 2 — a group at 2 with 6 weeks of silence is dormant, not a
  // candidate for further reduction. Enforced by the (future) cadence job,
  // not by this column definition.
  cadenceWeeks: smallint('cadence_weeks').notNull().default(1),
  // FIX-12: >=10 chars from a 32-char unambiguous alphabet (no 0/O/1/I),
  // never sequential, generated in the group.create service — not here.
  joinCode: text('join_code').notNull().unique(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  cadenceCheck: check('cadence_weeks_check', sql`${table.cadenceWeeks} IN (1, 2)`),
}));

export const groupMember = pgTable(
  'group_member',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => grp.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.userId] }),
  }),
);

export const calendarConnection = pgTable(
  'calendar_connection',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
    syncStatus: text('sync_status').notNull().default('active'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (table) => ({
    userProviderUnique: uniqueIndex('calendar_connection_user_provider_uq').on(
      table.userId,
      table.provider,
    ),
  }),
);

// INV-7: no title, location, or attendee columns — only busy/free intervals.
export const busyBlock = pgTable(
  'busy_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('calendar'),
  },
  (table) => ({
    userTimeIdx: index('idx_busy_user_time').on(
      table.userId,
      table.startsAt,
      table.endsAt,
    ),
  }),
);

export const signal = pgTable(
  'signal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => grp.id, { onDelete: 'cascade' }), // NULL = global
    weekStartDate: date('week_start_date').notNull(),
    vibe: vibeEnum('vibe').notNull(),
    note: varchar('note', { length: 140 }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // INV-8: exactly one global signal per user per week.
    globalUq: uniqueIndex('uq_signal_global')
      .on(table.userId, table.weekStartDate)
      .where(sql`${table.groupId} IS NULL`),
    scopedUq: uniqueIndex('uq_signal_scoped')
      .on(table.userId, table.groupId, table.weekStartDate)
      .where(sql`${table.groupId} IS NOT NULL`),
  }),
);

export const signalNight = pgTable(
  'signal_night',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => signal.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    state: nightStateEnum('state').notNull(),
    horizonWeek: smallint('horizon_week').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }), // NULL unless confirmed_free
    writtenBy: text('written_by').notNull(), // 'user' | 'sync' — see sql/0001_guard_invariants.sql
  },
  (table) => ({
    signalDateUq: uniqueIndex('signal_night_signal_date_uq').on(
      table.signalId,
      table.date,
    ),
    horizonCheck: check(
      'horizon_week_check',
      sql`${table.horizonWeek} BETWEEN 0 AND 2`,
    ),
  }),
);

export const plan = pgTable('plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => grp.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => appUser.id),
  title: text('title').notNull(),
  description: text('description'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  // FIX-10: was nullable, which silently broke attendance_prompt. Defaulted
  // at write time (plan.createFromNight) to starts_at + 4h — never null.
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  locationText: text('location_text'),
  isHomeHang: boolean('is_home_hang').notNull().default(false), // Open Question 7
  coverAsset: text('cover_asset'),
  status: planStatusEnum('status').notNull().default('live'),
  publicSlug: text('public_slug').notNull().unique(),
  attendanceConfirmedAt: timestamp('attendance_confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rsvp = pgTable(
  'rsvp',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plan.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => appUser.id), // NULL for guests
    guestName: text('guest_name'),
    status: rsvpStatusEnum('status').notNull(),
    plusOnes: smallint('plus_ones').notNull().default(0),
    respondedAt: timestamp('responded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userOrGuestCheck: check(
      'rsvp_user_or_guest_check',
      sql`${table.userId} IS NOT NULL OR ${table.guestName} IS NOT NULL`,
    ),
  }),
);

export const message = pgTable('message', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plan.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => appUser.id),
  body: text('body'),
  attachmentUrl: text('attachment_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// INV-5, INV-6
export const notificationLog = pgTable(
  'notification_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // signal|invite|starting_soon|poke|nudge
    rank: smallint('rank').notNull(), // 1..5, master doc §7.5
    channel: text('channel').notNull(), // sms|webpush|apns|fcm
    idempotencyKey: text('idempotency_key').notNull().unique(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    droppedReason: text('dropped_reason'), // 'budget_exceeded' etc.
  },
  (table) => ({
    budgetIdx: index('idx_notif_budget').on(table.userId, table.dispatchedAt),
  }),
);

export const poke = pgTable(
  'poke',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => grp.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => appUser.id),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => appUser.id),
    contextDate: date('context_date'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rateIdx: index('idx_poke_rate').on(table.recipientId, table.sentAt),
  }),
);

// v2, deferred — kept in the schema now so FKs from other v2 tables don't
// require a later breaking migration, per engineering-spec.md §2.
export const somedayItem = pgTable('someday_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'do' | 'want'
  title: text('title').notNull(),
  url: text('url'),
  priceCents: integer('price_cents'),
  note: text('note'),
  claimedBy: uuid('claimed_by').references(() => appUser.id), // NEVER exposed to userId
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
