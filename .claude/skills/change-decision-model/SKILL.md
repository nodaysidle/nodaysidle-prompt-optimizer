---
name: change-decision-model
description: Use whenever the user wants to change, add, swap, upgrade or compare a model the optimizer uses: the decision backends (TypeSafe, microsoft/microsoft-decision-1 via OpenRouter) in src/lib/decisions.ts, the rewrite models in MODEL_IDS (deepseek-v4.1-flash / deepseek-flash via platform.deepseek in src/lib/providers/completion.ts), or the eval judge (JUDGE_MODEL in evals/judge.ts). Also use when the user asks "which model should we use" or "is there a better model". Web research comes first, always.
---

# Change a decision model

Your memory of model names, prices and limits is out of date. Search first, then decide. Never assume.

## Steps

1. **Research on the web before touching code.** For each candidate model, find from a source dated in the last few months:
   - the exact model ID on the route the code uses (OpenRouter: `https://openrouter.ai/api/v1/models` or `/api/alpha/decisions`; DeepSeek: platform.deepseek.com / api-docs.deepseek.com; TypeSafe: api.typesafe.ai),
   - price per million input and output tokens,
   - context length and whether it supports JSON or structured output,
   - real latency reports, if any,
   - whether it is deprecated or about to be.
   Use WebSearch or Exa, and fetch the provider page itself. Cite the URL and date for every number.
   Watch out: OpenRouter's `/api/v1/models` lists chat models only. Decision models such as `microsoft/microsoft-decision-1` use a separate Decisions endpoint and are missing from it. Check `https://openrouter.ai/<id>` before calling a model gone.
   Changing `JUDGE_MODEL` resets every earlier judge score. If you switch, run the old and new judge once on the same rewrites, so later runs can still be compared.
2. **Show a comparison table** of the current model and the candidates, with your recommendation and the reason. Wait for the user's choice.
3. **Find every place the model lives:**
   `git grep -n "<old model id>"` (covers README, `.env.example` and e2e, which trail doesn't index) and `trail grep "MODEL_IDS"`. The grep is the real list; as of late Oct 2026 it is `src/lib/decisions.ts` (the backend list in `decide()`, `engine:` labels), `src/lib/providers/completion.ts` (`MODEL_IDS`), `src/lib/types.ts` (`MODELS`, `DEFAULT_MODEL`, `migrateModel`), the Settings copy in `src/components/settings-panel.tsx`, `README.md`, `.env.example`, `e2e/redline.spec.ts`, and `tests/{deepseek-models,server,chat-pipeline,domain}.test.ts`.
4. **Change all of them in one commit.** Old saved IDs must keep working through `migrateModel`. The server allowlist (`MODEL_IDS` is exact) must contain the new ID or the call never reaches the provider.
5. **Check the ID is live** with one tiny real call (ask first): a 1-token completion or a single decision question, which proves the ID and the key work.
6. **Measure** with the `optimize-optimizer` skill's Measure steps, old vs new model, and report latency next to quality.
7. **Finish with `ship-and-smoke`, then `done-report`.**

## Rules

- No model ID goes into code unless you saw it on the provider's own page or API in this session.
- Every price, limit and latency claim gets a source URL. Mark anything unsourced as unverified.
- Server keys are allowed only for the exact IDs in the allowlist. Don't loosen that to a prefix match.
- Diagnostics must still fall back to `runHeuristicDiagnostics` when every backend fails.
- Settings copy must say where the model comes from (see commit 6143f0d).

## Good example

> Searched OpenRouter's models API (fetched today) and the provider pages. Current judge `google/gemini-2.5-flash`: $0.30 / $2.50 per M tokens. Candidate `google/<id from the API>`: $X / $Y, structured output yes, listed since <date> ([link]). Recommend switching: same price tier, newer. Want me to switch the judge?

## Bad example

> I'll switch to gpt-5-mini, it's cheaper and faster. Updated MODEL_IDS.

No search, so the ID and the "cheaper and faster" are guesses. Only one of about eight places was changed, and nothing was measured.
