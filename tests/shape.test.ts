import { describe, expect, it } from "vitest";
import { dropMentionsOfRemoved, dropRepeatedBriefItems as dedupe, enforceFaithfulShape as shape, tidyQuestions } from "@/lib/shape";

const AUD = "make an audit of the repo in /dev/x/ and show me your findings";
const PAYMENTS =
  "Go through the payments service, it's in services/payments, and clean up the retry logic because there's three different backoff implementations. Don't change the public API and don't touch the webhook handler.";
const PAYMENTS_BRIEF = [
  "## Goal",
  "Clean up the retry logic in the payments service at `services/payments`, which currently has three different backoff implementations.",
  "",
  "## Context",
  "- The service lives at `services/payments`.",
  "- There are three different backoff implementations in the retry logic.",
  "",
  "## Constraints",
  "- Do not change the public API.",
  "- Do not touch the webhook handler.",
  "",
  "## Done when",
  "- The retry logic in `services/payments` uses a single backoff implementation instead of three.",
  "- The public API is unchanged.",
  "- The webhook handler is untouched.",
].join("\n");

describe("enforceFaithfulShape", () => {
  it("drops unlicensed Context, Deliverables and Done when in structured mode", () => {
    const out = "## Goal\nAudit /dev/x/.\n\n## Context\nIt is my project.\n\n## Deliverables\nA report.\n\n## Done when\nDone.";
    const r = shape(AUD, out, "structured", "user", []);
    expect(r.optimized).toBe("## Goal\nAudit /dev/x/.");
    expect(r.removed).toEqual(["Context", "Deliverables", "Done when"]);
  });
  it("keeps a section the user's own words license", () => {
    const r = shape("fix it. done when tests pass", "## Goal\nFix it.\n\n## Done when\nTests pass.", "structured", "user", []);
    expect(r.removed).toEqual([]);
  });
  it("keeps Requirements and Constraints", () => {
    const out = "## Goal\nReview.\n\n## Requirements\n- Be strict.\n\n## Constraints\n- Never nitpick.";
    expect(shape("review. be strict. never nitpick", out, "structured", "system", []).removed).toEqual([]);
  });
  it("keeps an in-body Assumptions block in creative mode as Requirements and fills the list", () => {
    const out = "Audit /dev/x/.\n\nAssumptions:\n- Read-only.\n- Cite lines.";
    const r = shape(AUD, out, "creative", "user", []);
    expect(r.optimized).toBe("Audit /dev/x/.\n\nRequirements:\n- Read-only.\n- Cite lines.");
    expect(r.assumptions).toEqual(["Read-only.", "Cite lines."]);
  });
  it("drops an in-body Assumptions block in structured mode", () => {
    const r = shape(AUD, "## Goal\nAudit.\n\nAssumptions:\n- Read-only.", "structured", "user", []);
    expect(r.optimized).toBe("## Goal\nAudit.");
  });
  it("leaves creative sections and existing assumptions alone", () => {
    const out = "Audit.\n\n## Requirements\n- Read-only.";
    expect(shape(AUD, out, "creative", "user", ["Read-only."]).removed).toEqual([]);
  });
  const LOGIN = "add login to my app. we use next-auth v4 with the Prisma adapter, next 15 and vitest";
  it("keeps a Context section built from the user's own facts", () => {
    const out = "## Goal\nAdd login to the app.\n\n## Context\n- next-auth v4 with the Prisma adapter\n- Next 15 and Vitest";
    const r = shape(LOGIN, out, "structured", "user", []);
    expect(r.removed).toEqual([]);
    expect(r.optimized).toContain("next-auth v4");
  });
  it("drops a Context section the model invented", () => {
    const out = "## Goal\nAdd login to the app.\n\n## Context\nThe project is a production web application used by paying customers.";
    const r = shape(LOGIN, out, "structured", "user", []);
    expect(r.removed).toEqual(["Context"]);
    expect(r.optimized).toBe("## Goal\nAdd login to the app.");
  });
  it("keeps a Workflow that repeats the user's steps without a trigger word", () => {
    const out = "## Goal\nRecover the job.\n\n## Workflow\n- Read the logs.\n- Find the failing job.\n- Restart it.";
    const r = shape("read the logs, find the failing job, restart it", out, "structured", "user", []);
    expect(r.removed).toEqual([]);
    expect(r.optimized).toContain("## Workflow");
  });
  it("drops a Done when that only restates the brief's own constraints", () => {
    const r = shape(PAYMENTS, PAYMENTS_BRIEF, "structured", "user", []);
    expect(r.removed).toEqual(["Done when"]);
    expect(r.optimized).toContain("## Context");
    expect(r.optimized).toContain("## Constraints");
  });
  it("keeps a Done when the user stated as a success condition", () => {
    const r = shape("fix the login bug. done when the e2e suite passes", "## Goal\nFix the login bug.\n\n## Done when\n- The e2e suite passes.", "structured", "user", []);
    expect(r.removed).toEqual([]);
  });
  it("ignores image prompts", () => {
    expect(shape("a dragon", "## Context\nx", "structured", "image", []).removed).toEqual([]);
  });
});

describe("dropRepeatedBriefItems", () => {
  const LOGIN_BRIEF = [
    "## Goal",
    "Add login to my app using email magic links only, with no passwords.",
    "",
    "## Context",
    "- Stack: next-auth v4 with the Prisma adapter, Next 15, vitest.",
    "",
    "## Requirements",
    "- Login uses email magic links only.",
    "- No password authentication.",
    "- Tests must pass before you say done.",
    "",
    "## Constraints",
    "- Use next-auth v4 with the Prisma adapter.",
    "- Do not add password login.",
  ].join("\n");
  it("drops a Requirements bullet that restates the Goal and keeps everything else", () => {
    const r = dedupe(LOGIN_BRIEF);
    expect(r.optimized).not.toContain("- Login uses email magic links only.");
    expect(r.optimized).toContain("- No password authentication.");
    expect(r.optimized).toContain("- Tests must pass before you say done.");
    expect(r.optimized).toContain("## Constraints\n- Use next-auth v4 with the Prisma adapter.\n- Do not add password login.");
    expect(r.removed).toEqual([]);
  });
  it("drops a Context bullet that restates the Goal and keeps the Constraints", () => {
    const shaped = shape(PAYMENTS, PAYMENTS_BRIEF, "structured", "user", []).optimized;
    const r = dedupe(shaped);
    expect(r.optimized).not.toContain("- There are three different backoff implementations in the retry logic.");
    expect(r.optimized).toContain("- The service lives at `services/payments`.");
    expect(r.optimized).toContain("- Do not change the public API.");
    expect(r.optimized).toContain("- Do not touch the webhook handler.");
    expect(r.removed).toEqual([]);
  });
  it("keeps a prohibition next to a positive line about the same thing", () => {
    const out = "## Goal\nAdd login with passwords.\n\n## Requirements\n- Do not store passwords in plain text for login.";
    expect(dedupe(out)).toEqual({ optimized: out, removed: [] });
  });
  it("never lets a positive line swallow a prohibition that uses all its words", () => {
    const out = "## Goal\nStore passwords in plain text for login.\n\n## Requirements\n- Do not store passwords in plain text for login.";
    expect(dedupe(out)).toEqual({ optimized: out, removed: [] });
  });
  it("drops a prohibition that repeats an earlier prohibition", () => {
    const out = "## Goal\nShip login and never store passwords in plain text.\n\n## Requirements\n- Never store passwords in plain text.\n- Use email links.";
    expect(dedupe(out)).toEqual({
      optimized: "## Goal\nShip login and never store passwords in plain text.\n\n## Requirements\n- Use email links.",
      removed: [],
    });
  });
  it("keeps a bullet that adds a number", () => {
    const out = "## Context\n- Stack: next-auth with the Prisma adapter.\n\n## Requirements\n- Use next-auth v4 with the Prisma adapter.";
    expect(dedupe(out)).toEqual({ optimized: out, removed: [] });
  });
  it("removes a section left empty and names it", () => {
    const out = "## Goal\nAdd login with email magic links.\n\n## Context\n- Login with email magic links.\n\n## Constraints\n- Do not add passwords.";
    expect(dedupe(out)).toEqual({
      optimized: "## Goal\nAdd login with email magic links.\n\n## Constraints\n- Do not add passwords.",
      removed: ["Context"],
    });
  });
  it("keeps the first statement and does not let a dropped bullet cover later ones", () => {
    const out =
      "## Goal\nFix the flaky checkout test before the release.\n\n## Requirements\n- Fix the flaky checkout test before Friday's release.\n- Friday release checkout test.";
    // The second bullet is only covered by the dropped one, so it stays.
    expect(dedupe(out).optimized).toBe(
      "## Goal\nFix the flaky checkout test before the release.\n\n## Requirements\n- Friday release checkout test.",
    );
  });
  it("never drops a Constraints bullet or a one-token bullet", () => {
    const out = "## Goal\nKeep the public API unchanged.\n\n## Requirements\n- Unchanged.\n\n## Constraints\n- Keep the public API unchanged.";
    expect(dedupe(out)).toEqual({ optimized: out, removed: [] });
  });
  it("returns a brief with no repeats unchanged", () => {
    const out = "## Goal\nAdd login.\n\n## Requirements\n- Use email magic links.\n- Tests must pass.";
    expect(dedupe(out)).toEqual({ optimized: out, removed: [] });
  });
  it("leaves text with a fenced code block unchanged", () => {
    const out = "## Goal\nRun the script.\n\n```sh\nnpm test\n```\n\n## Requirements\n- Run the script.";
    expect(dedupe(out)).toEqual({ optimized: out, removed: [] });
  });
});

describe("dropMentionsOfRemoved", () => {
  it("drops summary sentences and changes that describe a removed section", () => {
    const r = dropMentionsOfRemoved(
      ["Deliverables", "Done when"],
      "Rebuilt as a brief with Goal, Requirements, Deliverables and Done when. Kept the version numbers.",
      ["Added a Done when line", "Grouped requirements"],
    );
    expect(r).toEqual({ summary: "Kept the version numbers.", changes: ["Grouped requirements"] });
  });
  it("returns the inputs unchanged when nothing was removed", () => {
    const r = dropMentionsOfRemoved([], "Added Context. Kept numbers.", ["Added Context"]);
    expect(r).toEqual({ summary: "Added Context. Kept numbers.", changes: ["Added Context"] });
  });
  it("leaves an empty summary when every sentence names a removed section", () => {
    const r = dropMentionsOfRemoved(["Context"], "Added a Context section. Moved facts into context.", []);
    expect(r.summary).toBe("");
  });
});

describe("tidyQuestions", () => {
  it("drops the generic success question", () => {
    expect(tidyQuestions(["What counts as success? Add it to the prompt if it matters.", "Which branch?"], [])).toEqual(["Which branch?"]);
  });
  it("drops a question the listed assumptions already answer", () => {
    const q = ["Should the audit be read-only, or may files be edited?", "Which repo?"];
    expect(tidyQuestions(q, ["Read-only mode with no file edits."])).toEqual(["Which repo?"]);
  });
  it("keeps unrelated questions", () => {
    expect(tidyQuestions(["Which branch should it push to?"], ["Read-only mode."])).toEqual(["Which branch should it push to?"]);
  });
});
