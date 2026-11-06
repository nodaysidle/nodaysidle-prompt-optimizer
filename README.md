# NODAYSIDLE Prompt Optimizer

Paste a prompt. Get back edits to your own words, not a replacement you have to trust. Keep the edits you want, revert the rest, copy the final prompt.

Works on user prompts, system prompts, image prompts (Nano Banana, ChatGPT Images) and video prompts (Veo 3.1, Gemini Omni 1.1 and Omni 1.2 Flash). Image and video output is text only. Nothing is rendered here.

Live: https://nodaysidle-prompt-optimizer.vercel.app

## How a run goes

```text
your draft
  -> diagnose   TypeSafe Jev reads it if TYPESAFE_API_KEY is set, else Mouse-1 if
                MOUSE_API_KEY is set, else Microsoft Decision-1 via OpenRouter
                (rule-based if none answers)
  -> rewrite    DeepSeek V4.1 Flash or V4 Pro, one JSON rewrite
  -> verify     built-in checks (quoted text, numbers, code, length, no placeholders,
                no repeated brief items) plus the same TypeSafe / Mouse-1 /
                Decision-1 gate: intent kept, bloat, invented requirements,
                likely better
  -> repair     one second pass if verification fails
  -> result     edits you keep or revert, or your original if the rewrite did not earn its place
```

The five lamps beside the main button light as the server reports each of those stages. They never advance on a timer. They go out when the result lands.

## What the result tells you

- **Checked**: the judge model found your intent kept, no bloat, and no invented requirements, and the built-in checks passed.
- **Needs your review**: something was flagged. It is listed under "Worth a second look".
- **Original kept**: the rewrite failed verification, or was not clearly better. Your prompt comes back unchanged and you can still read the rejected draft.
- **Not independently checked**: no judge model was available, so only the built-in checks ran.

Short, clear prompts often come back unchanged. That is a valid result.

In a structured brief, each item belongs in one section. A hard limit goes under Constraints, not under both Requirements and Constraints. A repeat between those two sections triggers one repair; the same check runs again before the result is accepted.

The final prompt is built from the edits you keep and stays editable. If your hand edits drop quoted text, numbers or code from your original, or the reference-photo line, a warning says so.

## Keys and privacy

- Bring your own DeepSeek or OpenRouter key in Settings. Keys stay in this browser tab unless you choose to remember them, and then they are stored in plaintext in this browser.
- Your prompt goes from the browser to this app's server and on to the provider you chose. History and settings stay in your browser.
- The server's own keys are used only when the caller sends a valid `x-app-access-token` that matches `APP_ACCESS_TOKEN`. Without that variable set, only bring-your-own keys work.
- Diagnostics try the server's TypeSafe key, then Mouse-1, then Decision-1 via OpenRouter when the caller has the owner token. With a bring-your-own OpenRouter key they use Decision-1. With no decisions key at all they run as a rule-based estimate and the result says so.
- `DECISION_ORDER` reorders the judge chain without disabling it. It is a comma-separated list of `typesafe`, `mouse`, `decision1`; missing names are appended in the default order, so `mouse` means Mouse first, then TypeSafe, then Decision-1.
- No analytics. No accounts.

## Run it locally

Node 22 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and add a key in Settings. Environment variables for shared access are listed in `.env.example`.

## Checks

```sh
npm run lint
npm run typecheck
npm test            # unit tests
npm run test:e2e    # browser: overflow at 390, 768, 1440 px, 44px targets, focus ring, focus traps
npm run build
npm run check:contracts  # TypeSafe OpenAPI path/model plus Mouse and Decision-1 reachability
```

### Output quality

Two scripts run against any deployment. Both read `OPENROUTER_API_KEY` from the environment and send it only to the optimizer under test and to openrouter.ai.

```sh
EVAL_BASE_URL=http://127.0.0.1:3000 node --env-file=.env.local evals/run-eval.ts
node --env-file=.env.local evals/judge.ts --base http://127.0.0.1:3000 --out judge.json
```

- `run-eval.ts` runs 10 seeds through hard checks: quoted text and numbers kept, no questionnaire, length cap, injection resisted, identity lock present.
- `judge.ts` runs the same seeds, then asks a different model (Gemini 2.5 Flash) to compare each original with its rewrite in a fixed random order. It reports how often the rewrite wins, whether it invents requirements, and how bloated it is. One run is a sample, not a benchmark.

## Where things live

- `src/lib/providers/chat.ts`: the pipeline above.
- `src/lib/decisions.ts`: diagnostics and the quality gate (TypeSafe, then Mouse-1, then Decision-1), and the rule-based fallback.
- `src/lib/optimizer-prompt.ts`: prompts, strict response parsing, preservation checks.
- `src/lib/providers/completion.ts`: OpenRouter first, DeepSeek direct as fallback, with a deadline, abort, size cap and strict response schema.
- `src/lib/redline.ts`: turns the original and the rewrite into keep-or-revert edits.
- `src/lib/server/`: request limits and the access check for the server's keys.
- `DESIGN.md`: the visual direction and the reason for each choice.

## Limits

- Target profiles are versioned guidance for a prompt's wording. They are not integrations, and nothing here generates an image or a video.
- The judge and the gate are model opinions, not guarantees.
- The per-instance request limit counts by the client address Vercel sets, resets on each serverless instance, and does nothing where no trusted address exists. It is a courtesy, not a quota. What protects the owner's keys is the access token.
