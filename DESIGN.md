# NODAYSIDLE Prompt Optimizer: design direction

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

Reading this as: a one-screen prompt editor for developers and people who write for AI models, in the NODAYSIDLE "Lights out" language (black, off-white, one red, engineering type).

## Where this comes from

The tokens and the voice are the studio's own, taken from the published apps site (nodaysidle-apps.vercel.app): background `#050505`, ink `#f2f2f2`, one red `#e10600`, Saira Condensed for display, IBM Plex Sans and Mono for text. The apps site passed its own anti-slop delivery gate with these tokens. This tool reuses them so it reads as part of the same catalogue. The earlier indigo, zinc and Geist look was a stock dark SaaS theme and is gone.

## The idea: Redline

The optimizer returns edits to your own words, not a replacement you have to trust. Your prompt stays in view. Each change is a block you keep or revert. The final prompt is built from the edits you keep, and stays editable.

- Red is the markup and progress color. It marks what was removed (a red strike) and lights the start lamps. It never fills a control: the primary inverts to an ink outline on hover. One accent, used at the moment it carries information.
- Start lights are the progress indicator. Five lamps come on as the server reports each real stage (request sent, reading, rewriting, checking, second pass). They go out when the result lands. They never run on a timer, so they never claim progress that did not happen.
- Verdicts are plain words: Checked, Needs your review, Original kept, Not independently checked. No invented scores.

## Decisions and the reason for each (R-31)

| Decision | Reason |
|---|---|
| Black `#050505`, ink `#f2f2f2` | Studio identity. Long editing sessions favour low glare. Dark is the brand, not a trend. |
| One accent, red `#e10600` | The studio's single accent. Used for markup and the start lamps only. 4.10:1 on black, so it is never small text. |
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
| The first screen is the editor, not a hero | The tool has one job. The run row sits with the draft and is fully visible at 1366x768. |
| The blocked primary opens Settings | A disabled button is a dead end. The first click is the fix, not a link at the fold. |
| Settings puts the key first and Save in a fixed footer | The setup path is what a new user needs; Save must never scroll away. The body scrolls, the header and footer do not. |
| The draft read and a labelled example fill the result column before a run | The column is the space the result will take. It shows the product and the one feature that works without a key. |
| Red never fills a control | Red means removed text or a lit lamp. The primary inverts to an ink outline on hover. |
| One primary per state | After a result, Copy final prompt is the action; the run becomes Run again. |
| The likeness lock is a standard 44px ink toggle | It is a control, not a badge, and it edits the draft, so it stays with the draft label. |
| Human labels in history | Prompt kind, mode and target are words, not internal enums or profile versions. |
| Two rows on a phone header | Brand and actions share the first row; the tool name sits under it. Below 380px it stacks. |

## Rules held

Em dashes are not used anywhere in the interface copy. Every colour pairing is measured with the contrast checker. Every control is reachable by keyboard with a visible focus ring. Empty, loading, error and missing-key states are all designed. Nothing in the interface shows a number the server did not return.
