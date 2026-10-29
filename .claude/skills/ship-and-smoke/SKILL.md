---
name: ship-and-smoke
description: Use to finish ANY change to the prompt optimizer, and whenever the user says ship, deploy, redeploy, push it live, or "is it done". Done here means checks pass, the change is live on https://nodaysidle-prompt-optimizer.vercel.app, and one real prompt the user approved has been run through the live app with the before and after shown. Never call a task done without this.
---

# Ship and smoke

Done = tested end to end, redeployed, smoke-tested live, reported. Anything less is "not done yet", and you say which step is missing.

## Steps

1. **Start from production.** `git fetch origin` and check `git log HEAD..origin/master --oneline`. If the branch is behind, say so and rebase or merge first. Production is whatever is on `origin/master`.
2. **Local checks, all of them** (same as `.github/workflows/check.yml`):
   `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`
   Paste the failing output if any step fails. `npm run lint` errors on untracked `.trail/*.cjs` only; that one is not yours.
   If e2e fails with `Executable doesn't exist ... chrome-headless-shell`, the browser is missing, not the app: run `npx playwright install chromium` and run e2e again.
3. **Commit** in the repo's style (`fix:`, `feat:`, `perf:`, `docs:`, short plain-English subject). Run `trail check` first.
4. **Ask before pushing.** Show the commits that will go to `master`, then wait for yes. Production deploys automatically: Vercel's git integration builds every push to `master`. There is no manual `vercel --prod` step.
5. **Wait for the deploy.** Poll until the deployment for your commit reports `success`:
   ```sh
   SHA=$(git rev-parse HEAD)
   ID=$(gh api repos/nodaysidle/nodaysidle-prompt-optimizer/deployments --jq ".[] | select(.sha==\"$SHA\" and .environment==\"Production\") | .id" | head -1)
   gh api repos/nodaysidle/nodaysidle-prompt-optimizer/deployments/$ID/statuses --jq '.[0].state'
   ```
   The Vercel MCP has no access to the `muhambals-projects` scope; use `gh`.
6. **Propose the smoke prompt and ask for approval.** It is a real paid API call. Pick one real prompt that exercises the change (a seed from `evals/seeds.json` or one the user gave). For user or system prompts, use a messy, unstructured one and `--mode structured`: that's the job the user cares about. Show the exact prompt, kind and mode, and wait for yes.
7. **Run it against production:**
   ```sh
   node --env-file=/home/arch/dev/nodaysidle/nodaysidle-prompt-optimizer/.env.local \
     .claude/skills/ship-and-smoke/smoke.mjs --kind user --mode structured "<prompt>"
   ```
   The `.env.local` lives in the main checkout (first path in `git worktree list`). Never print or echo it.
8. **Show the before and after** exactly as printed, then hand off to the `done-report` skill.

## Rules

- Never say "done", "shipped" or "live" before step 7 printed HTTP 200 from production.
- One smoke call per approval. If you want a second one, ask again.
- If the gate kept the original (`rejectedDraft`), report that honestly; don't rerun until you get a nicer result.
- Don't push to `master` or deploy without an explicit yes in this conversation.

## Good example

> Checks: lint, typecheck, 214 tests, build, e2e all pass. Ready to push 2 commits to master: `fix: repair prompt keeps the user's numbers`. OK to push?
> (yes) Deploy `a1b2c3d` is success. Smoke prompt: `coding-strict` seed, user, minimal. OK to run one real call?
> (yes) HTTP 200 in 6.4s. BEFORE: ... AFTER: ... Then the done report.

## Bad example

> I updated the prompt and the unit tests pass. It should work once deployed. Done!

This skipped the build, e2e, the deploy, the live call, and the before and after. "Should work" is not tested.
