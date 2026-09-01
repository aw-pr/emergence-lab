# Stage card 74-sweep-write-ups-record-what-landed: the sweeps still list work that is finished

## Metadata

- **Authored:** 2026-09-01
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/74-sweep-write-ups-record-what-landed
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** false
- **Verifier panel:** false
- **Pairing rationale:** same family, different model, Codex being exhausted at
  authoring time. This is a currency audit rather than a code change, and the
  verifier's job is to disbelieve each "closed" claim independently.
- **Type:** Documentation currency.

## Surfacing concern

`docs/sweeps/2026-08-24-overnight-summary.md:167` opens a section headed
"Metric follow-ups still open" and lists five items, prefaced "None of
tonight's six stages closed any of these". All five have since been closed:

| Follow-up | Closed by |
|---|---|
| Circular statistics for Kuramoto | stage 65 |
| Circular statistics for Swarmalators | stage 65 |
| Multi-lag / FFT-band structure term | stage 66 |
| Lorenz multi-snapshot averaging | stage 67 |
| Point-cloud / sparse-sim scoring | stage 63, landed 2026-09-01 |

`docs/sweeps/abelian-sandpile-interestingness.md:88` says the kernel topple
defect is "Flagged for a follow-up card". Stage 59 fixed it, and line 111 of
the same file already says so — the document contradicts itself eleven lines
apart.

Three of the four escalations in the summary are also settled: Physarum's
fourth preset landed as stage 68, Lenia's as stage 69, and the Crystal lattice
sign-off is recorded at line 127 as already on `dev`.

This is not tidiness. These documents are the inputs stage cards are written
from, and an agent reading them today would card work that is already done —
which is a full worker budget spent re-deriving a landed result. The stale
list survived four separate sweeps precisely because closing an item and
recording that it closed are two different actions and only the first was
anybody's job.

## Inputs (read these in your own context)

- All sixteen files in `docs/sweeps/`
- `state/state.yaml`, for what actually completed and when
- `docs/stages/59|60|63|65|66|67|68|69-*.md`, to confirm scope before claiming
  a follow-up is closed

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Every open-follow-up and escalation claim across `docs/sweeps/` reconciled
   against `state/state.yaml`. Closed items marked closed, **with the stage id
   that closed them and its completion date**, not silently deleted — the
   history of what was open and why is the useful part.
2. Items still genuinely open left open, and listed together in the summary so
   there is one place to look. On today's evidence that is the Brian's Brain
   `dyingValue` axis (blocked on stage 72's float32 fix) and the U-skate
   gliders repair (stage 73), but verify rather than copying this list.
3. `docs/sweeps/abelian-sandpile-interestingness.md` self-contradiction at
   lines 88 and 111 resolved.
4. A dated note at the top of the summary saying it was reconciled, by which
   stage, and against what.

## Constraints

- **Do not rewrite history.** A dated write-up records what was true on its
  date; annotate it, never restate it as though it always said so. Closure
  notes are additions.
- No changes outside `docs/sweeps/`.
- Do not open new follow-ups. If you find something genuinely unrecorded,
  name it in the handoff for the operator to card.

## Acceptance criteria

1. Every "still open", "follow-up", "flagged for a card" and "escalation"
   string in `docs/sweeps/` is either closed with a stage id and date, or
   confirmed still open with a reason.
2. Each closure claim is checked against `state/state.yaml` status, not
   against another document's assertion. List the checks in the handoff.
3. The sandpile file no longer contradicts itself.
4. No dated section's original text is altered; additions only. A reviewer can
   still read what the document said on its own date.
5. `git diff` touches only `docs/sweeps/`.

## Out of scope

- Any code, preset, metric or test change.
- Re-running any sweep. This card reads results, it does not produce them.
- `HANDOFF.md` and `docs/todo.md`.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If a follow-up cannot be confidently matched to a stage, leave it open and say
why. A wrong closure is worse than a stale one: a stale item costs a re-read,
a wrongly-closed item means real work is never done and nobody is looking for
it any more.

## Verifier handoff

Disbelieve each closure. For at least the five metric follow-ups, confirm the
named stage's status in `state/state.yaml` **and** that its card's scope
actually covers the claim — a completed stage with a different objective does
not close a follow-up just because the topics are adjacent. Then confirm
criterion 4 by checking the diff adds rather than rewrites.
