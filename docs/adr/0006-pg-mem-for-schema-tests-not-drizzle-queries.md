# ADR-0006: pg-mem validates the migration SQL and its constraints directly — not Drizzle query code, and not the plpgsql triggers

**Status:** accepted
**Date:** 2026-09-04

## Context

Since T2, the actual behavior of `0000_initial_schema.sql` and the hand-written trigger SQL (`sql/0001`, `sql/0002`) has never run against any real Postgres — no Supabase project or other database has been provisioned. Unit tests can fake `ctx.supabase` (a couple of methods) convincingly, but faking Drizzle's query builder well enough to trust the fake felt like a worse bet than admitting the gap (see `tests/trpc/group.test.ts`'s doc comment). Auditing T1-T4 on 2026-09-04, tried to close part of this gap with `pg-mem`, a pure-JS in-memory SQL engine — no Docker, no sudo, no binary download (an earlier attempt at a real embedded Postgres for the T1-T3 audit had failed exactly on those grounds).

## Decision

`pg-mem` validates two things, both directly against the real generated migration file, not a hand-copied approximation of it:
1. That `0000_initial_schema.sql` is valid, executable SQL (types, tables, indexes, all of it).
2. That the constraints it declares — `grp.join_code` uniqueness, the `cadence_weeks`/`horizon_week`/`rsvp_user_or_guest` CHECKs, FK cascade deletes, and INV-8's partial unique indexes — actually enforce what engineering-spec.md says they enforce.

This runs through pg-mem's own native query interface (`mem.public.none/many`), not through Drizzle. `docs/backlog.md` and `tests/integration/createEmulatedDb.ts`'s doc comment both say plainly what this does NOT cover: anything requiring plpgsql (the guard triggers — INV-1 — and the app_user-creation trigger — FIX-1), and the actual TypeScript query-building code in `group.ts` (its `db.transaction()`, `.onConflictDoNothing()`, join-code-collision retry).

## Alternatives considered

**Drizzle + pg-mem's `pg`-compatible adapter (`drizzle-orm/node-postgres` + `mem.adapters.createPg()`).** This was the actual goal — testing `group.ts`'s real query code, not just the schema. Tried it first. Hit two separate `NotSupported` throws from pg-mem's adapter: drizzle-orm's node-postgres driver unconditionally sends `types.getTypeParser` and `rowMode: 'array'` on every query, and pg-mem's `pg` emulation explicitly refuses both. The `types.getTypeParser` one has a safe workaround (strip it — only changes which type-coercion path runs). `rowMode` does not: silently converting an array-mode response back to object shape without drizzle knowing changes what shape of data drizzle's own downstream code thinks it received, without erroring — a corrupted-but-passing test is worse than an honest gap, so this was abandoned once `rowMode` turned out to need more than a strip-the-field patch.

**`drizzle-orm/pg-proxy` (bring-your-own query executor).** Would have sidestepped the `pg`-adapter emulation layer entirely. Not pursued past a read of the API: pg-mem's native query interface (`ISchema.query`) has no separate parameter-binding argument (no `$1`/`$2` support at that layer), meaning the proxy callback would need to interpolate parameters into SQL text by hand — reintroducing manual escaping in a codebase that otherwise never does that, for uncertain payoff given `pg-proxy`'s transaction semantics were also unconfirmed. Cut before sinking more time into a second uncertain path in the same session.

**Embedded/real Postgres (`embedded-postgres` npm package).** Tried during the earlier T1-T3 audit; the install hung twice with no Docker or sudo available. Not retried here.

## Consequences

This is real signal, narrower than originally hoped: it would have caught the T2 audit's actual bugs (the empty migrations folder, the `auth.users` stub table, the missing `signal_night` GRANT — well, the GRANT gap specifically, since that's a permissions issue this harness doesn't model at the role level, but the DDL-validity ones, yes) if it had existed before that audit. It would NOT catch an INV-1 trigger regression or a bug in `group.ts`'s actual query code — those still need a live Postgres, which remains the standing gap in `docs/backlog.md`. Don't read a green `migrationSql.test.ts` run as "the database layer is verified" — it verifies the schema, not the app code that queries it.
