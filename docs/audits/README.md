# Audits

Four adversarial reviews on four different axes. They are kept apart on
purpose: **each one found defects the others structurally could not**, and
collapsing them into a single "review" would have lost the findings that
mattered most.

Three of them live in this directory. The fourth — the review of the idea
itself — predates the repo and lives inside the document it reshaped.

| Where | Audits | Findings | Asks |
|---|---|---|---|
| `../overlap-master-doc.md` §0 | the **idea** | A1–A11 | Would this product fail on its own terms? |
| `audit-report.md` | the **documentation** | FIX-1–FIX-13 | If an implementer followed these documents literally, where would they stall or guess? |
| `implementation-audit.md` | the **code** | IMP-1–IMP-15 | Does the built thing do what the documents say? |
| `coherence-audit.md` | the **seams** | X-1–X-32 | Where do two documents contradict each other? |

**`audit-report.md` is the one whose name doesn't say what it audits.** It
reviews the *build documentation* — the spec, the agent prompt, the checklists
— not the product design. The A-series design findings are in the master doc.
That distinction has been misread more than once; it is the reason this file
exists.

## What each axis taught

Worth carrying into the next review, because each pattern is a class of defect
rather than a one-off:

> **Design** — the failure modes were all forms of over-promising: asserting
> more about people than they had actually said.
>
> **Documentation** — the worst defects were *omissions*, not errors. Nothing
> defined what "the signals for a group" meant, so an implementer would have
> guessed, inside the one piece of real logic in the product.
>
> **Implementation** — every defect that mattered was found by *running* the
> thing, not by reading it. Middleware that was never loaded, a join that
> deleted people, a phone number rendered to a whole group.
>
> **Coherence** — every correction that got lost was lost in the seam between
> two documents that each assumed the other was carrying it. Five accepted
> corrections had spec surface and no ticket; they would simply never have been
> built.

## These are not closed

`audit-report.md` gained a **FIX-13** *after* implementation began, reported
from a ticket rather than from a reading — and it overrode a decision already
recorded in `../adr/0007`. An audit document is not necessarily finished at the
point code starts.

Every finding's current status lives in `../traceability.md`, not here. These
files record what was found and why; the matrix records whether it is true
today.
