# Stage card 91-logistic-mandelbrot-detail-adjudication: is it actually a better picture

## Metadata

- **Authored:** 2026-09-10
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Base branch:** dev
- **Run branch:** autometta/91-logistic-mandelbrot-detail-adjudication
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 90-logistic-mandelbrot-windowed-domain
- **Path claims:** docs/images, docs/audits/2026-09-11-logistic-mandelbrot-detail-adjudication.md
- **Pairing rationale:** both seats Claude, deliberately, and the repo has done
  this before for the same reason (stage 85, 2026-09-07). The deliverable is
  frames and a judgement about them; a Codex seat cannot open a browser on this
  machine, so a cross-family pairing is not available at either seat. What
  contains the loss is the shape of the acceptance: the verifier looks at the
  frames and forms its own view *before* reading the prose, which is an
  independent judgement rather than a rerun of the worker's reasoning. The
  verifier is the Fable aesthetic tier precisely because that judgement is the
  gate.
- **Type:** Visual adjudication closing the slate.
- **Serialises with:** everything before it. It reads the tree the other four
  cards produced.

## Surfacing concern

Cards 88, 89 and 90 will each have passed their own acceptance. That is not the
same as the operator getting what they asked for, which was in their words to
"increase the resolution and maybe get more detail of the bulbs and swirls
close up", with a zoom that works.

This repo has now twice found that a prior stage's prose about pictures outran
what the pictures show — stage 83's structure-led margins and stage 85's
correction of stage 76's account of Waves. Both were caught by putting eyes on
frames rather than re-reading numbers. This card is that step, done on purpose
rather than by luck, and it is the only place in the slate where the question
is the operator's question rather than a criterion's.

## Inputs (read these in your own context)

- `docs/audits/2026-09-11-logistic-mandelbrot-zoom-and-resolution-ceiling.md` —
  card 87's audit and its ranked defect list, which is the scorecard
- The frames card 87 committed to `docs/images/`, which are the *before* set
- `docs/stages/88-logistic-mandelbrot-zoom-camera-repair.md`,
  `docs/stages/89-logistic-mandelbrot-period-detection-window.md`,
  `docs/stages/90-logistic-mandelbrot-windowed-domain.md` — what each claimed
  to deliver, and any partial each recorded
- `state/verifiers/88-logistic-mandelbrot-zoom-camera-repair.json`,
  `state/verifiers/89-logistic-mandelbrot-period-detection-window.json`,
  `state/verifiers/90-logistic-mandelbrot-windowed-domain.json` — the verdicts,
  read for what was and was not accepted

Do not read the implementation diffs unless a frame surprises you and you need
to know why. This card is about the picture.

## Deliverables

1. **A matched before/after set in `docs/images/`,** dated. Every after frame
   reproduces a card 87 before frame at the same parameters, the same camera
   pose and the same region, differing only in the code under it. At minimum:
   the default opening view; a close-up on the period-2 bulb; a close-up on a
   swirl region in the cascade; and the maximum zoom-in frame. Name the
   parameters and the sampler path for each.
2. **`docs/audits/2026-09-11-logistic-mandelbrot-detail-adjudication.md`,**
   which answers three questions and takes a side on each.
   - **Does the zoom work now?** Not "does the test pass" — does it go where
     you point it, stay where you put it, and keep looking like a surface as it
     closes. Say which of those three hold and which do not.
   - **Is there more detail in the bulbs and swirls?** Compare the matched
     close-ups. Say what is visible in the after frame that is not visible in
     the before frame, or say that nothing is, which is a legitimate finding.
   - **Is it a better picture?** Separately from either of the above. More
     resolved is not automatically better; a denser cloud can read as noise,
     and a period-labelled cascade can read as banding where a chaotic wash
     read as texture. Take a side.
3. **A scorecard against card 87's ranked defect list:** for each ranked
   defect, fixed, partly fixed, or untouched, with the frame or the number that
   says so.
4. **One recommendation for what comes next,** named as a further card rather
   than done here. If that recommendation is to turn card 90's control on by
   default, say so explicitly and give the reason; the operator will decide.

## Constraints

- **Change no code.** This card adjudicates. Your claims are two documentation
  paths and nothing else.
- Every after frame is matched to a before frame. An after frame with no
  counterpart proves nothing about a change.
- Where a card before this one landed a partial, adjudicate what landed, not
  what the card asked for.
- If card 90's new control defaults off, capture the after close-ups with it
  both off and on, and label them. Adjudicating the on state while the shipped
  default is the off state, without saying so, is the specific way this card
  could mislead.
- Do not commit anything under `public/baked/`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the
stage.

1. `npm run verify` green.
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim in the envelope, with one sentence saying which of
   its three outcomes it was and why that is correct for this card. This card
   claims only documentation and images, so exit 2 with `no relevant changed
   files to inspect in the working tree` is the expected outcome and satisfies
   this criterion.
3. The matched before/after set exists, every after frame names its before
   counterpart, and the parameters and sampler path are recorded for each.
4. All three questions are answered and a side is taken on each. "It depends"
   is not a side.
5. The scorecard covers every defect card 87 ranked, with evidence per row.
6. Where card 90's control exists and defaults off, both states are captured
   and labelled.
7. One next-card recommendation, with its reason.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Any code change, including a one-line default flip.
- Re-running or re-judging the earlier cards' own acceptance criteria. Their
  verifiers did that; this card judges the result, not the process.
- New work identified along the way, which becomes the recommendation in
  deliverable 4.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 30 minutes
- **Token baseline:** worker 3.0M, verifier 0.8M. Stage 85, the closest
  precedent in this repo, ran 2.70M worker and 0.36M verifier. Above 6.0M on
  the worker, stop and report.

## Escalation

If fewer than two of cards 88, 89 and 90 landed, stop and say so rather than
adjudicating a slate that did not happen. A before/after comparison across one
change is card 88's or card 90's own acceptance repeated, and this card adds
nothing to it.

If the after frames are worse than the before frames, say that plainly and in
the headline. A negative result here is the most valuable thing this card can
produce and the operator gets to see it before anything is deployed.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it passed
and the evidence: the command run and its verbatim exit code and message, or
the committed path. Carry your three answers in one sentence each. State your
token spend.

## Verifier handoff

Look at the four matched pairs before you read a word of the audit, and write
down your own answer to "is it a better picture" before you read the worker's.
Then compare. Where you disagree, say so in your report; the disagreement is
more useful to the operator than a concurrence.

Two failures to catch.

The first is more-is-better. A frame with more visible structure is not
automatically the better frame, and this slate's whole thrust makes that the
easy conclusion to reach. If the audit treats a denser or busier picture as
self-evidently an improvement, that is the failure.

The second is an unmatched comparison. Check that the after close-ups really
are the same region at the same camera pose — a slightly different crop or a
slightly closer camera will manufacture "more detail" out of nothing, and it is
the most likely way this card produces a confident wrong answer.

## Family-specific notes

Both seats are Claude. Launch Chromium with `--use-angle=metal --enable-gpu` or
the WebGL2 canvas crashes the headless browser on this machine.

The run worktree needs `node_modules` before `npm run verify` will do anything
but exit 127.
