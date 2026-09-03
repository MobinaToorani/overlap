# tRPC routers

Empty on purpose. `docs/agent-prompt.md` gates the API surface (`docs/engineering-spec.md` §5) behind T3 (auth), T4 (groups), T6 (Signal), T11+ (plans) — this pass only built the pieces that stand alone without those: the DB schema, `resolveSignals()`, and `computeOverlap()`. Wiring these into `auth.*` / `group.*` / `signal.*` / `plan.*` procedures starts with T3.
