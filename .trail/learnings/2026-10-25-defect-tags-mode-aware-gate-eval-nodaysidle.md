---
title: "Defect tags, mode-aware gate, eval hits production"
author: Nodaysidle
date: 2026-10-25
branch: chore/claude-canary
cost: { minutes: 7, tokens: 109305 }
touches:
  - AGENTS.md
  - CLAUDE.md
  - src/lib/decisions.ts
  - src/lib/defects.ts
  - src/lib/gate.ts
  - src/lib/optimizer-prompt.ts
  - src/lib/providers/chat.ts
  - src/lib/types.ts
  - tests/optimizer-prompt.test.ts
  - tests/chat-pipeline.test.ts
---

## Decided
- Defect tags (VAGUE_OUTPUT_SCHEMA etc.) live in `src/lib/defects.ts`; per-mode gate thresholds in `src/lib/gate.ts`. Both are pure modules on purpose: `tests/chat-pipeline.test.ts` mocks `@/lib/decisions`, so anything chat.ts or optimizer-prompt.ts needs must not come from decisions.ts.
- Restructure/creative: overEngineered 0.55, minImprovement 0.35. Light edit stays 0.4 / 0.45. Intent stays 0.7 everywhere. The judge question also gets a "Restructure mode" note.
- Dialect is chosen by mode and by the prompt's own style (XML stays XML, else Markdown contract). There is no target-LLM selector, so "Claude XML vs GPT Markdown" cannot be keyed on a model.

## Tried and ruled out
- Heuristic (no-key) defect tags: skipped, regexes would not be calibrated.

## Watch out
- `npm run eval` defaults to the LIVE site (`EVAL_BASE_URL`), not local code. To test local changes: `next start -p 3100` and `EVAL_BASE_URL=http://localhost:3100`.
- Eval is noisy. `image-identity-lock-scene` (intent ~47-50%) and `video-no-camera-requested` fail on the old code too.
- `pkill -f "next start..."` inside a command that contains that string kills your own shell.
- `npm run lint` errors only on untracked `.trail/*.cjs`.
