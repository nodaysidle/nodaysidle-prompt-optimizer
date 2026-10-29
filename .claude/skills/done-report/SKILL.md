---
name: done-report
description: Use as the final message of every optimizer task, right after ship-and-smoke has run the live smoke test (or to report why it couldn't). Gives a short summary, an honest opinion on whether the change makes the optimizer better, and two or three new ideas. Use it also when the user asks "what did you do", "is it better", or "what next".
---

# Done report

The user reads this once. Keep it short, plain, and honest.

## Steps

1. **Status line.** One line: shipped and smoke-tested live, or exactly which step is missing (checks, deploy, smoke) and why.
2. **What changed.** At most 3 bullets, each naming the file and what the change does for a real prompt. No list of every edit.
3. **Evidence.** The live before and after from the smoke run (short excerpts are fine), plus eval or judge numbers before and after if they ran. Say when a number is from a single noisy run.
4. **My opinion.** Is the output closer to agent-ready (clear task, context, constraints, output format, done criteria)? Does this make the optimizer better? Answer yes, no, or unclear, give the reason, and say what would change your mind. Disagree with the change if the evidence is weak.
5. **New ideas.** Two or three concrete next steps, each one line with the file or seed it touches and why it would help. Prefer ideas the eval can measure.
6. **Skipped / risk.** One line on what you didn't check.

## Rules

- No em dashes, no hype words ("robust", "seamless", "significantly improved").
- Never claim an improvement the evidence doesn't show. One judge run is a sample, not proof.
- Ideas must be specific to this optimizer, not generic advice like "add more tests".
- The whole report fits on one screen.

## Good example

> **Shipped and smoke-tested live** (`a1b2c3d`).
> - `src/lib/optimizer-prompt.ts`: the minimal-mode rules went from 14 lines to 9; it no longer asks for headings on short prompts.
>
> Live, `vague-user`: before "help me write something for work", after "Write a short, professional message for work. ..." Judge: rewrite won 7/10 before, 8/10 after (one run each, so this is within noise).
>
> **Opinion:** Slightly better. The shorter rules cut bloat on short prompts, but the judge gain is within noise. Three more judge runs would settle it.
>
> **Ideas:** (1) Add a seed for a one-line system prompt; nothing tests that today. (2) Have the gate's `improves` score pick between two drafts instead of just yes/no. (3) Log which defect tags fire most, to target the next tightening.
>
> Not checked: image and video seeds.

## Bad example

> I've made significant improvements to the optimizer prompts, which should greatly enhance output quality. Everything is working great! Let me know if you need anything else.

No evidence, no opinion with a reason, no ideas, and "should" where proof belongs.
