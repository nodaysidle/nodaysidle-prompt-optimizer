---
title: Mouse-1 as first decisions backend
author: Nodaysidle
date: 2026-10-21
branch: feat/mouse-decisions
touches:
  - ".env.example"
  - AGENTS.md
  - README.md
  - src/app/api/diagnose/route.ts
  - src/app/api/optimize/route.ts
  - src/lib/decisions.ts
  - src/lib/providers/chat.ts
  - src/lib/server/access.ts
  - tests/server.test.ts
---

## Decided
- `src/lib/decisions.ts` tries backends in order via `decide()`: mouse-1 (`https://api.mouse.dev/v1/decisions`, 3 s) then Decision-1 on OpenRouter (6 s), then `runHeuristicDiagnostics`. Mouse uses the same wire shape (`state` + keyed `questions`, `answers.<key>.noul` is a 0..1 probability), so `mapDiagnosticAnswers` is reused unchanged.
- An invalid gate answer throws inside `accept`, so the next backend is tried instead of trusting it. A cancelled request is never retried.
- `MOUSE_API_KEY` is server-only and gated by the access token (`resolveOptionalMouseKey` in `src/lib/server/access.ts`), the same as the other server keys. decisions.ts still never reads process.env (a test enforces this).
- Work is on branch `feat/mouse-decisions`, not merged. Shipping it with the 23 Oct launch is Alan's call.

## Tried and ruled out
- A per-user `x-mouse-key` header and settings UI: skipped to keep the change small before launch.

## Watch out
- Live mouse-1 latency: the first call takes 7 to 25 s, warm calls 0.4 to 0.7 s, not the advertised ~100 ms. Cold calls fall back after 3 s.
- The dev shell exports a real MOUSE_API_KEY, so tests/server.test.ts stubs it to "" in beforeEach. Without that, route tests hit the Mouse URL.
- node_modules was missing devDeps (@vitejs/plugin-react). Run `npm install` before `npx vitest run`.
