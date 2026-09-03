# Architecture Decision Records

Short records of decisions that were genuinely debatable and would be expensive to silently re-litigate later. Not every decision needs one — most of `engineering-spec.md` already *is* the decision record for this product; an ADR is for the handful of calls made **while implementing** that a future contributor (or agent) might otherwise reverse without knowing why.

**When to add one:** you chose between two reasonable implementation approaches and picked one for a specific reason, especially where the "obvious" alternative looks tempting later (see ADR-0002 and ADR-0003 for the pattern).

**When not to:** anything already mandated by `engineering-spec.md` — link to the section instead of restating it.

Numbered sequentially, never renumbered or deleted — superseded decisions get a new ADR that says so and links back, per `0000-template.md`.
