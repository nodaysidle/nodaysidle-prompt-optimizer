# NODAYSIDLE Prompt Workbench

A preservation-first prompt editor for user, system, image and video text. Dark desktop-first layout, existing BrandMark and Geist. Image/video profiles provide text review only, not generation.

## Run locally

Requires Node 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. App-server heuristic diagnostics work without credentials: drafts are sent to this app's server, but not to an AI provider. Configure a DeepSeek BYOK key in Settings to rewrite or run text evaluations. Connection tests and real runs may incur charges; the automated tests use mocks only.

## Workbench

- Minimal is the default: smallest useful edit. Structured organizes supplied information. Creative authorizes optional expansion, with assumptions listed separately.
- Missing facts are questions outside the candidate; new generated bracket variables/tags and invalid JSON are rejected. Existing literal user brackets remain valid.
- Draft diagnostics use app-server heuristics by default, not browser-only analysis or calibrated probabilities. Your draft is transmitted to the app server. Short tasks, optional personas and static-camera intent are valid. AI-provider diagnosis requires an explicit provider selection; app-server heuristic fallback requires separate consent. There is no silent cross-provider cascade.
- Candidates include changes, questions, assumptions, warnings and a preservation check state: passed, needs review or unavailable. Failed/unavailable checks do not become successful checks. A passed rubric is not a guarantee of downstream model quality.
- Draft edits cancel old requests; request identities also reject late results. Diff and tests bind to the frozen original/kind/mode/profile/model. Candidate edits and restored history make old verification stale.
- Examples and next-draft replacement support Undo. Ratio/lens controls replace a single selection instead of accumulating conflicts.
- Text A/B sends two actual completions with the same scenario, model, temperature, output cap and kind-specific roles. If either side fails, no comparison is shown. Elapsed time is measured; usage is displayed only if returned. Visual A/B is disabled.
- Browser-local versioned history stores originals, candidates, mode/profile/model and checks/notes. Favorites are protected from recent-history rolling eviction; explicit deletion/clear still removes them. Storage failures are surfaced. Malformed legacy history entries are skipped and legacy checks are unverified. Legacy saved credentials remain untouched until an explicit Forget choice.

## Provider contracts

DeepSeek defaults to `deepseek-flash` (DeepSeek-V4.1-Flash); the other supported option is `deepseek-v4-pro` (DeepSeek-V4-Pro-0813). Thinking is explicitly disabled so temperature applies. Old saved `deepseek-chat`/`deepseek-reasoner` aliases migrate to Flash/Pro, not unsupported endpoint names.

Contracts reviewed 2026-10-14: [chat completions](https://api-docs.deepseek.com/api/create-chat-completion), [models/pricing](https://api-docs.deepseek.com/quick_start/pricing). Only `finish_reason: stop` is accepted; truncated/filtered/aborted/tool responses are actionable failures. JSON rewriting must satisfy the full schema, never raw-text or regex fallbacks.

Profiles live in `src/lib/profiles.ts`, with version, capability and official-source links. [FLUX.2](https://docs.bfl.ai/guides/prompting_guide_flux2) has no negative prompts. Veo 3.1 is labeled a legacy workflow. Midjourney v6.1/SDXL/Kling/Runway profiles are explicitly historical or support-limited. Unknown negative-field and host syntax support is not invented. Recheck official contracts before extending a profile; no visual rendering API is integrated.

## Private shared access and privacy

BYOK works anonymously. Any owner-funded DeepSeek, OpenRouter or TypeSafe environment key requires a configured `APP_ACCESS_TOKEN` and the explicitly supplied matching `x-app-access-token`. Without the configured token, **all shared-key fallback is disabled**. Provider keys are resolved separately, never guessed by prefix. Comparison is constant-time over fixed-length digests. `/api/config` returns booleans only, never credentials.

Optional server environment configuration:

```ini
APP_ACCESS_TOKEN=
DEEPSEEK_API_KEY=
OPENROUTER_API_KEY=
TYPESAFE_API_KEY=
```

The owner must configure `APP_ACCESS_TOKEN` before using shared keys, including on Vercel. Treat it as a private shared secret, not per-user identity/authentication. Distribute it only to trusted users, rotate it when needed, use HTTPS, and add deployment firewall/access restrictions and provider spending quotas. The in-memory throttle is **per server instance**, not a distributed or durable quota. Thirty requests per minute per credential digest, a bounded 1,000-entry map, 150KB request bodies with a 15-second ingress deadline, 20,000-character prompt/scenario bounds, provider deadlines, cancellation and output caps reduce abuse but do not replace platform controls.

New provider keys and the owner token live in session memory by default. Provider keys may optionally be remembered as **plaintext browser localStorage**, which is accessible to origin scripts and other users of that browser. The owner token is never persisted. Existing v2 saved credentials are not silently deleted or imported during bootstrap or v3 saves, including malformed legacy JSON. Settings reports detection metadata without displaying key values. **Import saved credentials for this session** imports only valid bounded known provider keys into memory, without a provider call, persistent writes, shared-token import or implicit AI-provider selection. App-server heuristics remain the default after import; automatic diagnosis is paused until explicitly re-enabled, so importing cannot send an existing draft. Explicitly save with browser remembering selected to persist imported keys in v3; the v2 copy still remains until **Forget legacy credentials** removes it. **Forget all credentials** explicitly clears both saved copies and session credentials. Browser storage failures are surfaced. Supported model aliases migrate on each load and are persisted when settings are explicitly saved. Do not use browser remembering on a shared device.

Rewrites/evaluations send prompt data and credentials through this app's Node route handlers to the selected provider. The `local` diagnostic enum means **app-server heuristics, no AI-provider transmission**, not browser-only processing: `/api/diagnose` receives the draft on the app server. Optional AI-provider diagnostics send data through that server to the selected provider. This app does not log raw upstream bodies/credentials; errors are sanitized and include an app request ID. This is not a promise about hosting-platform logs or provider retention policies. History stays on this browser; prompts you enter may themselves contain sensitive data, so review what you submit.

## Architecture

Next.js 16.3.8 App Router, React 19, TypeScript, Tailwind 4. Native accessible modal dialogs share Escape/focus-wrap/focus-return/scroll-lock behavior. The draft editor is the only live draft copy; result snapshots are immutable inputs with editable candidates.

`src/lib/validation.ts` checks runtime domains. `src/lib/server/` handles bounded request parsing, private shared access and errors. `src/lib/providers/completion.ts` handles bounded completions/deadlines/cancellation/schema and returned usage. `src/lib/jev.ts` handles selected external diagnostics and local rules. `src/lib/storage.ts` handles versioned persistence/migration. No client diagnostics are trusted as instructions: the server recomputes its own bounded observations.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

For an existing browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its absolute Chrome path. CI runs lint, typecheck, unit/ReactDOM tests, build, mocked browser tests and production dependency audit. Build self-hosts Geist via Next/font and may need network access to retrieve fonts.

Unit tests cover invalid input, every shared provider access boundary, throttle, deadline/cancellation, redaction, completion schema, missing quality answers, local rubric behavior, modes/profiles/presets/history and race/frozen-diff behavior. Browser tests exercise keyboard dialogs, editor actions, example Undo, settings/session persistence, mocked text A/B and narrow overflow. Mocks prove software boundaries, not paid-provider quality or downstream rendering fidelity.
