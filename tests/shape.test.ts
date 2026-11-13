import { describe, expect, it } from "vitest";
import { dropMentionsOfRemoved, enforceFaithfulShape as shape, tidyQuestions } from "@/lib/shape";

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
