# NODAYSIDLE Prompt Optimizer: design direction

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

Reading this as: a one-screen prompt editor for developers and people who write for AI models, in the NODAYSIDLE "Lights out" language (black, off-white, one red, engineering type).

## Where this comes from

The tokens and the voice are the studio's own, taken from the published apps site (nodaysidle-apps.vercel.app): background `#050505`, ink `#f2f2f2`, one red `#e10600`, Saira Condensed for display, IBM Plex Sans and Mono for text. The apps site passed its own anti-slop delivery gate with these tokens. This tool reuses them so it reads as part of the same catalogue. The earlier indigo, zinc and Geist look was a stock dark SaaS theme and is gone.

## The idea: Redline

The optimizer returns edits to your own words, not a replacement you have to trust. Your prompt stays in view. Each change is a block you keep or revert. The final prompt is built from the edits you keep, and stays editable.

- Red is the markup color. It marks what was removed (a red strike) and what changed. It appears nowhere else except the hover state of the main action. One accent, used at the moment it carries information.
- Start lights are the progress indicator. Five lamps come on as the server reports each real stage (request sent, diagnosing, rewriting, checking, ready). They go out when the result lands. They never run on a timer, so they never claim progress that did not happen.
- Verdicts are plain words: Checked, Needs your review, Original kept, Not independently checked. No invented scores.

## Decisions and the reason for each (R-31)

| Decision | Reason |
|---|---|
| Black `#050505`, ink `#f2f2f2` | Studio identity. Long editing sessions favour low glare. Dark is the brand, not a trend. |
| One accent, red `#e10600` | The studio's single accent. Used for markup only. 4.10:1 on black, so it is never small text. |
| `#ff6b63` for small red text | `#e10600` fails 4.5:1 for small text. `#ff6b63` is 7.31:1 on `#050505`. |
| Control edges `#6e6e6e` | 4.00:1 on `#050505`, above the 3:1 non-text bar. `#262626` is decorative rules only. |
| Saira Condensed for display | Studio display face, motorsport timing-screen character. Used for the wordmark and section titles only. |
| IBM Plex Mono for the prompt text | Prompts are literal text where spacing and punctuation matter. Mono makes edits legible. |
| IBM Plex Sans for controls | Studio text face. Readable at small sizes. |
| No icons | Controls are words. A text label says more than a generic glyph, and an icon set would be the stock library look. |
| No shadows, glow, glass, gradients | The page is flat. Hierarchy comes from type size, ink weight and rules. |
| Two columns on desktop, stacked on phones | The draft and its redline sit side by side so the edit is read against the source. Stacking keeps phone widths free of horizontal scroll. |
| Edits as blocks, not inline spans | An inline strike inside flowing text cannot be a 44px target. A block per change can, and reads like a marked-up contract. |
| Keep or revert per sentence or line | Word-level toggles produce broken grammar. Sentence or line chunks keep each choice meaningful. |
| Reasons shown as a summary, not per edit | The model's change list is not aligned to individual edits. Mapping them would invent a link. |
| Motion: hover and focus only, plus the lamps | Lamps change state on real stage events. No loops, no entrance animation. |

## Rules held

Em dashes are not used anywhere in the interface copy. Every colour pairing is measured with the contrast checker. Every control is reachable by keyboard with a visible focus ring. Empty, loading, error and missing-key states are all designed. Nothing in the interface shows a number the server did not return.
