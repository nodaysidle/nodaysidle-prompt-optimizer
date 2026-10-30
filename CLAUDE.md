# CLAUDE.md — nodaysidle-prompt-optimizer-redline

## 1. Canary — read first
- Start every reply with `ALAN`. No exceptions, including one-line answers.
- If `HANDOFF.md` exists, read it before doing anything else.
- When the session is long or you cannot clearly recall earlier work, say so, then write `HANDOFF.md` before continuing. It covers the goal, what's done, what's left, key files and open questions, so a fresh session can resume from it alone.
- Consult `/home/arch/dev/nodaysidle/nodaysidle-knowledge` (`sessions/LATEST.md` and `wiki/`) as the central source of truth for ecosystem decisions.

## 2. Skills and Corrections
- Project skills live in `.claude/skills/`: `tighten-optimizer-prompt`, `optimize-optimizer`, `change-decision-model`, `ship-and-smoke`, `done-report`.
- Whenever the user corrects you, say which skill should change and exactly how (the line to add, edit or remove). Change the skill only after the user says yes. If no skill fits, propose a new one the same way.

## 3. Execution Posture (Opus 5.5 Directives)
- Prioritize direct code execution, compiler checks, and tool use over conversational narration.
- Do not provide mid-task status summaries or narrate routine file reads.
- Continue autonomously through multi-step frontend/optimizer implementations until full test pass; only pause if blocked by a critical ambiguity.
- The smallest change that fully satisfies the task (YAGNI). Avoid premature component abstractions.

## 4. Command Matrix
*Execute these exact commands:*

| Command | Purpose |
|---------|---------|
| `npm run dev` | Launch Next.js dev server |
| `npm run build` | Next.js production build verification |
| `npm run typecheck` | Strict TypeScript check (`tsc --noEmit --incremental false`) |
| `npm test` | Run Vitest unit & integration test suite |
| `npm run test:e2e` | Playwright end-to-end test suite |
| `npm run lint` | ESLint verification |
| `npm run eval` | Run prompt optimization evaluation suite (`evals/run-eval.ts`) |

## 5. Architecture & Runtime Constraints
- **Product**: One-screen prompt redline & optimization tool in the NODAYSIDLE "Lights out" design language. Turns messy text prompts into agent-ready briefs (Goal, Context, Requirements, Constraints, Workflow, Deliverables, Done when) in Restructure (`structured`) mode.
- **Stack**: Next.js 16.3.8 (App Router), React 19.2.8, Tailwind CSS v4, TypeScript 5, Vitest, Playwright.
- **Core Engine & Data Flow**:
  - `src/lib/optimizer-prompt.ts` — Prompt rewriting, Restructure rules, agent-ready brief templates, identity lock.
  - `src/lib/gate.ts` & `src/lib/decisions.ts` — Quality gate judging locked rewrites against locked originals; defect tags and repair loop.
  - `src/lib/providers/` — Client-side direct LLM API clients (OpenAI, Gemini, DeepSeek, CommandCode).
  - `src/components/prompt-workspace.tsx` & `src/components/` — Side-by-side redline diffs (desktop) / stacked (mobile); diffing powered by `diff`.
- **Design Discipline ("Lights Out")**:
  - **Tokens**: Black `#050505`, ink `#f2f2f2`, single accent red `#e10600` (markup only), small text red `#ff6b63`. Control edges `#6e6e6e` (4.00:1 contrast).
  - **Typography**: Saira Condensed for display/headers, IBM Plex Mono for prompt diffs, IBM Plex Sans for controls.
  - **UI Principles**: Flat page, strictly NO icons (words only), NO shadows/glow/glass/gradients, minimum 44px touch targets.
  - **Diff Structure**: Redline edits are sentence or line blocks (kept or reverted), never broken word-level fragments.
- **Client-Side Privacy**: API keys entered securely by user, handled strictly in the browser; never persist or leak keys to server logs or remote storage.
- **Repository Context (Trail)**:
  - This repo is indexed in `.trail/cache/`. Use `trail ask "<query>" --source` before inspecting code; use `trail skeleton <file>` to skim API surfaces.

## 6. Negative Constraints (Anti-Defaults)
- Zero `any` in TypeScript; explicitly type all diff and optimizer return payloads.
- No dummy prompt optimizer mocks or fake timers; progress start lamps reflect real server stage events.
- Never break sentence/line blocks into fragmented word-level diffs.
- Avoid generic AI SaaS tropes: no pill buttons, no off-white/cream backgrounds, no arbitrary gradients.
- Never leave temporary debug logs, test buttons, or uncommitted scaffolding in pull requests.

## 7. Modular Imports
@AGENTS.md
@README.md
@DESIGN.md
@INSTRUCTIONS.md
