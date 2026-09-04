# tRPC routers

`auth.*` (T3) and `group.*` (T4, minus `group.overlap` and `group.shareCard` — see group.ts's doc comment) are wired in so far. `docs/agent-prompt.md` gates the rest of the API surface (`docs/engineering-spec.md` §5) behind their own tickets — `signal.*` (T6), `plan.*` (T11+). Add each to `_app.ts` when its ticket starts, not before.
