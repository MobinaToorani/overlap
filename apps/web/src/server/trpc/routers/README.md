# tRPC routers

`auth.*` (T3) is the only router wired in so far. `docs/agent-prompt.md` gates the rest of the API surface (`docs/engineering-spec.md` §5) behind their own tickets — `group.*` (T4), `signal.*` (T6), `plan.*` (T11+). Add each to `_app.ts` when its ticket starts, not before.
