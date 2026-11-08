import { describe, expect, it } from "vitest";
import { findFaithfulnessViolations as check } from "@/lib/faithfulness";

const AUDIT = "make an audit of the repo you are in in /dev/nodaysidle/xyproject/ and show me your findings";

describe("faithfulness guardrails", () => {
  it("passes a faithful restatement that keeps the path", () => {
    expect(check(AUDIT, "Audit the repository at /dev/nodaysidle/xyproject/ and show me your findings.", "minimal", "user")).toEqual([]);
  });
  it("flags a changed path", () => {
    expect(check(AUDIT, "Audit the repository at /dev/nodaysidle/other/.", "minimal", "user").join()).toMatch(/path/);
  });
  it("flags read-only, workflow and assumptions added in faithful modes", () => {
    const bad = "## Goal\nAudit /dev/nodaysidle/xyproject/.\n\n## Assumptions\n- Read-only: do not edit any files.";
    const found = check(AUDIT, bad, "structured", "user").join();
    expect(found).toMatch(/read-only/);
    expect(found).toMatch(/Assumptions/);
  });
  it("flags ready to send and a new word limit", () => {
    const found = check("write a cold email to a dentist", "Write a cold email under 150 words, ready to send.", "minimal", "user").join();
    expect(found).toMatch(/ready-to-send|readiness/);
    expect(found).toMatch(/150 words/);
  });
  it("allows a limit the user wrote", () => {
    expect(check("write a 100 words intro", "Write a 100 words intro.", "minimal", "user")).toEqual([]);
  });
  it("flags focus on narrowed to only", () => {
    expect(check("tell me what to improve, focus on the api folder", "Review only the api folder.", "structured", "user").join()).toMatch(/only/);
  });
  it("in creative mode requires each addition to be listed as an assumption", () => {
    const out = "Audit /dev/nodaysidle/xyproject/.\nRead-only: do not edit any files.\nStop and report if the path is missing.";
    expect(check(AUDIT, out, "creative", "user", ["Read-only mode."]).join()).toMatch(/stop condition/);
    expect(check(AUDIT, out, "creative", "user", ["Read-only mode.", "Stop if the path is missing."])).toEqual([]);
  });
  it("flags read-only combined with running checks", () => {
    const out = "Audit /dev/nodaysidle/xyproject/. Read-only. Run the existing checks.";
    expect(check(AUDIT, out, "creative", "user", ["read-only", "run checks"]).join()).toMatch(/may write files/);
  });
  it("ignores image and video prompts", () => {
    expect(check("a dragon", "read-only", "minimal", "image")).toEqual([]);
  });
});
