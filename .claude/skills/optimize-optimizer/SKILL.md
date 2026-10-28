---
name: optimize-optimizer
description: Use when the user wants the optimizer itself to produce better rewrites: "optimize the optimizer", improve output quality, fewer rejected drafts, less bloat, better intent keeping, tune gate thresholds (src/lib/gate.ts), defect tags (src/lib/defects.ts), the repair loop, or the pipeline in src/lib/providers/chat.ts. Every change is judged by an eval run before and after. Also holds the Measure steps the other optimizer skills use.
---

# Optimize the optimizer

A change is an improvement only if the eval says so. Your opinion comes after the numbers, not instead of them.

## Steps

1. **Sync with production.** `git fetch origin`; catch up if behind `origin/master`.
2. **Name the target.** One sentence: which failure you're fixing, and which seed in `evals/seeds.json` shows it. If no seed shows it, add one first. That is part of the change.
3. **Measure the baseline** (see Measure below) on the current code.
4. **Make the smallest change** that targets that failure. One idea per run, so the numbers mean something.
5. **Measure again** on the new code with the same seeds.
6. **Compare in a table:** per seed pass/fail for `run-eval`, and the judge's wins, ties, invents and bloat. Call out seeds that got worse.
7. **Decide.** Keep the change only if the target seed improved and nothing else regressed beyond noise. Otherwise revert and report what you learned.
8. **Finish with `ship-and-smoke`, then `done-report`.** Save a `trail note` if you learned why something didn't work.

## Measure

Eval and judge are paid calls. Ask before running, and say roughly how many calls: 10 seeds is about 10 to 30 calls per script.

```sh
ENV=/home/arch/dev/nodaysidle/nodaysidle-prompt-optimizer/.env.local
npm run build && { npx next start -p 3100 & PID=$!; }
until curl -so /dev/null http://localhost:3100; do sleep 1; done
EVAL_BASE_URL=http://localhost:3100 node --env-file=$ENV evals/run-eval.ts | tee eval-<label>.txt
node --env-file=$ENV evals/judge.ts --base http://localhost:3100 --out judge-<label>.json
kill $PID
```
Run it as one command so `$PID` survives.

- `npm run eval` with no `EVAL_BASE_URL` hits the LIVE site, not your code.
- Stop the server by PID. `pkill -f "next start"` in a command containing that string kills your own shell.
- Baseline: `git stash push -u -m optimizer-baseline` is unsafe here (shared stash). Use a throwaway worktree on `origin/master` for the "before" run instead.
- Known noisy: `image-identity-lock-scene` (intent ~47-50%) and `video-no-camera-requested` fail on old code too. Don't count them as regressions without a pattern.
- A gap of 1 seed or 1 judge win is noise. Run both sides once more and decide on the totals of 2 runs each.
- Simplest "before" for a one-file change: copy your edited file to the scratchpad, `git checkout -- <file>`, build and measure, then copy it back.
- Write outputs to the scratchpad, never the repo.
- A tightening that only cuts words passes when quality holds (no real drop over 2 runs). It doesn't need a quality gain, because fewer tokens is the gain.

## Rules

- No "better" without a before and after on the same seeds.
- One change per measured run.
- Gate thresholds: intent stays 0.7 in every mode unless the user says otherwise. Change `GATE_BY_MODE`, not inline numbers.
- `chat.ts` and `optimizer-prompt.ts` must not import from `decisions.ts`; `tests/chat-pipeline.test.ts` mocks it. Shared logic goes in `defects.ts` or `gate.ts`.
- Say whether you think it helps, and why. If the numbers are flat, say flat.

## Good example

> Target: `vague-user` comes back as a questionnaire 2 out of 3 times. Change: one line in the minimal-mode prompt, "If details are missing, write the best complete prompt with sensible defaults; never ask the reader questions." Baseline: run-eval 7/10, judge rewrite wins 5. After: 8/10, wins 6, `vague-user` passes, no new failures; `video-no-camera-requested` still fails, as it does on old code. Keeping it. My view: real but small; the questionnaire check passes now.

## Bad example

> I lowered the overEngineered threshold, improved the repair prompt and added a new defect tag. The outputs look much better now.

Three changes in one run, no baseline, no seeds, "look better" from eyeballing, and nothing is measured.
