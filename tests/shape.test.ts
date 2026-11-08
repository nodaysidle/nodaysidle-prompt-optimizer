import { describe, expect, it } from "vitest";
import { enforceFaithfulShape as shape, tidyQuestions } from "@/lib/shape";

const AUD = "make an audit of the repo in /dev/x/ and show me your findings";

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
  it("ignores image prompts", () => {
    expect(shape("a dragon", "## Context\nx", "structured", "image", []).removed).toEqual([]);
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
