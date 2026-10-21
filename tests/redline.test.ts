import { describe, expect, it } from "vitest";
import { assemble, buildRedline, editsOf, toUnits } from "@/lib/redline";

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

describe("toUnits", () => {
  it("joins back to exactly the input", () => {
    for (const text of [
      "One sentence.",
      "Two. Sentences here!\nAnd a line without punctuation\n- a list item\n- another",
      "  leading space. trailing newline\n",
      "",
      "no terminal punctuation",
    ]) {
      expect(toUnits(text).join("")).toBe(text);
    }
  });

  it("splits at sentence ends and line breaks", () => {
    expect(toUnits("A b. C d.\nE f")).toEqual(["A b. ", "C d.\n", "E f"]);
  });
});

describe("buildRedline", () => {
  it("returns one unchanged stretch when nothing changed", () => {
    const segments = buildRedline("Summarize the report.", "Summarize the report.");
    expect(segments).toEqual([{ kind: "same", text: "Summarize the report." }]);
  });

  it("treats a reworded sentence as a single edit", () => {
    const segments = buildRedline(
      "Write a poem. Make it short.",
      "Write a poem. Keep it under twelve lines.",
    );
    const edits = editsOf(segments);
    expect(edits).toHaveLength(1);
    expect(edits[0].removed).toBe("Make it short.");
    expect(edits[0].added).toBe("Keep it under twelve lines.");
  });

  it("represents a pure insertion and a pure deletion", () => {
    const inserted = editsOf(buildRedline("Do the task.", "Do the task. Show your work."));
    expect(inserted).toEqual([{ kind: "edit", id: 0, removed: "", added: "Show your work." }]);

    const deleted = editsOf(buildRedline("Do the task. Be very polite.", "Do the task."));
    expect(deleted).toHaveLength(1);
    expect(deleted[0].added).toBe("");
    expect(deleted[0].removed.trim()).toBe("Be very polite.");
  });

  it("numbers edits in reading order", () => {
    const edits = editsOf(
      buildRedline("A one. B two. C three.", "A uno. B two. C tres."),
    );
    expect(edits.map((edit) => edit.id)).toEqual([0, 1]);
  });

  it("ignores changes that are only whitespace", () => {
    expect(editsOf(buildRedline("Hello world.\n", "Hello world."))).toHaveLength(0);
  });

  it("works on prompts that are lists with no sentence punctuation", () => {
    const original = "- first item\n- second item\n- third item";
    const optimized = "- first item\n- second item, with detail\n- third item";
    const edits = editsOf(buildRedline(original, optimized));
    expect(edits).toHaveLength(1);
    expect(edits[0].removed.trim()).toBe("- second item");
  });
});

describe("assemble", () => {
  const original = "You are a helper. Answer briefly. Use plain words.";
  const optimized = "You are a helper. Answer in two sentences. Use plain words. Cite sources.";
  const segments = buildRedline(original, optimized);

  it("keeping every edit gives exactly the rewrite", () => {
    expect(assemble(segments, new Set())).toBe(optimized);
  });

  it("reverting every edit gives the original, apart from whitespace", () => {
    const all = new Set(editsOf(segments).map((edit) => edit.id));
    expect(squash(assemble(segments, all))).toBe(squash(original));
  });

  it("reverting one edit changes only that edit", () => {
    const [first] = editsOf(segments);
    const result = assemble(segments, new Set([first.id]));
    expect(result).toContain("Answer briefly.");
    expect(result).toContain("Cite sources.");
    expect(result).not.toContain("two sentences");
  });
});
