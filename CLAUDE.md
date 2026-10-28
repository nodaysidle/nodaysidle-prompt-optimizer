## Canary — read first

- Start every reply with `ALAN`. No exceptions, including one-line answers.
- If `HANDOFF.md` exists, read it before doing anything else.
- When the session is long, or you can't clearly recall earlier work, say so,
  then write `HANDOFF.md` before continuing. It covers the goal, what's done,
  what's left, key files and open questions, so a fresh session can resume
  from it alone.

## Skills and corrections

- Project skills live in `.claude/skills/`: `tighten-optimizer-prompt`,
  `optimize-optimizer`, `change-decision-model`, `ship-and-smoke`, `done-report`.
- Whenever the user corrects you, say which skill should change and exactly how
  (the line to add, edit or remove). Change the skill only after the user says
  yes. If no skill fits, propose a new one the same way.

@AGENTS.md
