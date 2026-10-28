---
name: tighten-optimizer-prompt
description: Use when the user asks to tighten, shorten, clean up, sharpen or reword the prompts the optimizer sends to models. That covers the rewrite and repair prompts in src/lib/optimizer-prompt.ts, the engine guidance, and the Decision-1/gate question text in src/lib/decisions.ts. Not for changing pipeline logic or thresholds (use optimize-optimizer) or swapping models (use change-decision-model).
---

# Tighten optimizer prompt

Tighter means fewer words that do the same job, or the same words doing it better. It never means longer.

## Steps

1. **Sync with production.** `git fetch origin`; if `HEAD` is behind `origin/master`, catch up first. Prompts moved there recently (`src/lib/defects.ts`, `src/lib/gate.ts`).
2. **Find the exact prompt text.** `trail skeleton src/lib/optimizer-prompt.ts`; the prompt bodies are in `buildOptimizerMessages`, `buildRepairMessages`, `engineGuidance`, `buildDiagnosisBlock`. Gate and diagnosis questions are the `*_QUESTION` constants and `questionsForKind` in `src/lib/decisions.ts`.
3. **Record the baseline.** Count the words of each block you'll touch (`wc -w` on the extracted text). Note which tests pin its wording: `grep -n` the phrase in `tests/optimizer-prompt.test.ts` and `tests/chat-pipeline.test.ts`.
4. **Edit.** Cut repeats, hedges and rules the parser already enforces (preservation checks, length caps, the identity lock in `enforceIdentityLock`). Keep every behavior rule unless the user asked to drop it.
5. **Show the diff and the word counts before and after.** Name any rule you merged or removed and why.
6. **Measure.** Follow the "Measure" steps in the `optimize-optimizer` skill: run eval and judge on the old and the new code locally, after the user approves the paid calls.
7. **Finish with `ship-and-smoke`, then `done-report`.**

## Rules

- No em dashes anywhere in `src/` (`tests/copy.test.ts` fails on one). Use a colon, comma or full stop.
- The new text must not be longer than the old, unless the user asked for a new rule.
- Never change meaning silently. If one wording change could shift model behavior, list it.
- Keep the JSON output contract that `parseOptimizationResponse` reads exactly as it is.
- Update the tests that pin the wording in the same change; don't delete an assertion to make it pass.

## Good example

> `buildOptimizerMessages`, minimal mode: 212 words down to 141. Merged "keep the user's language" and "never translate" into one rule. Dropped "do not exceed the length limit": `findLengthViolation` already enforces it and triggers a repair. No behavior rule removed. The `tests/optimizer-prompt.test.ts` phrase check is updated. Next: baseline vs new eval, which needs about 20 paid calls. OK?

## Bad example

> I rewrote the system prompt to be more comprehensive and robust — it now covers edge cases like tone, formatting and audience.

It got longer, added rules nobody asked for, used an em dash (the copy test fails), and has no before and after.
