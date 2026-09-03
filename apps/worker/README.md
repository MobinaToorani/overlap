# Worker (Python) — skeleton only

This app is a placeholder directory, not a running service. The full worker (FastAPI + APScheduler on Fly.io, the five jobs in `docs/engineering-spec.md` §6) is ticket **T8**, and its jobs depend on features this pass didn't build yet (T3 auth, T9 calendar OAuth, T16 dispatch). Building it out now would be code with nothing to call it and no way to test it honestly.

What's here:
- `jobs/`, `lib/`, `tests/` — the directory shape from `docs/engineering-spec.md` §2, so the layout is settled before T8 starts.

When T8 starts, this app connects to Postgres as the `overlap_worker` role (see `apps/web/src/server/db/sql/0001_guard_invariants.sql`) — never with elevated credentials. That role is physically unable to write `signal_night.state = 'confirmed_free'` (INV-1, FIX-4), which is the whole point: the worker enforcing this by *inability*, not by careful code.
