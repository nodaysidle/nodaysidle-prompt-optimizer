import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_TARGETS } from "@/lib/types";
import { PROFILES } from "@/lib/profiles";
import { mapDiagnosticAnswers, runHeuristicDiagnostics } from "@/lib/decisions";
import {
  PREVIOUS_IDENTITY_LOCKS,
  buildOptimizerMessages,
  enforceIdentityLock,
  identityLockFor,
  preservationWarnings,
  startsWithIdentityLock,
} from "@/lib/optimizer-prompt";

describe("target profiles drive visual structure", () => {
  it("never asks a video target for the bracket template", () => {
    for (const target of ["universal", "veo", "omni", "omni-1.2"] as const) {
      const { system } = buildOptimizerMessages("a dog catches a frisbee", "video", undefined, target);
      expect(system).not.toMatch(/\[SCENE|\[TEMPORAL|\[CAMERA PATH|\[NEGATIVE/);
      expect(system).toContain("No bracketed section tags");
    }
  });

  it("sends each target's own profile and likeness line", () => {
    for (const target of ENGINE_TARGETS) {
      const kind = PROFILES[target].kinds.includes("video") ? "video" : "image";
      const { system } = buildOptimizerMessages("The subject in the photo on a beach", kind, undefined, target);
      expect(system).toContain(identityLockFor(target));
      if (target !== "universal") expect(system).toContain(PROFILES[target].version);
    }
  });

  it("no longer cites the unsupported @Image syntax for Omni 1.1", () => {
    expect(PROFILES.omni.guidance).not.toContain("@Image");
  });

  it("keeps profile statuses free of a trailing period (the UI adds one)", () => {
    for (const target of ENGINE_TARGETS) expect(PROFILES[target].status).not.toMatch(/\.$/);
  });

  it("keeps the eval's likeness lines in sync with the app", () => {
    const evalSource = readFileSync(join(__dirname, "../evals/run-eval.ts"), "utf8");
    for (const target of ENGINE_TARGETS) expect(evalSource).toContain(identityLockFor(target));
  });
});

describe("likeness lock yields to what the prompt asks for", () => {
  const RETIRED = [
    ["nano-banana", ["skin tone, hair and apparent age the same", "the same as in the photo."]],
    ["gpt-image", ["skin tone, hair and apparent age the same", "the same as in Image 1."]],
    ["veo", ["skin tone, hair and apparent age the same", "not as the opening frame."]],
    ["omni", ["exact face, hair, skin tone and build", "not as a literal frame."]],
    ["omni-1.2", ["build, and clothing consistent"]],
  ] as const;

  for (const [target, dropped] of RETIRED) {
    const kind = PROFILES[target].kinds.includes("video") ? "video" : "image";
    const previous = PREVIOUS_IDENTITY_LOCKS[target] ?? "";

    it(`replaces the previous ${target} lock from saved history with the current one`, () => {
      expect(previous).not.toBe("");
      const out = enforceIdentityLock(`${previous} A portrait at night.`, kind, target);
      expect(out).toBe(`${identityLockFor(target)} A portrait at night.`);
      expect(out.split(identityLockFor(target)).length - 1).toBe(1);
      expect(out).not.toContain(previous);
      for (const phrase of dropped) expect(out).not.toContain(phrase);
    });

    it(`recognises both the current and the previous ${target} lock`, () => {
      expect(startsWithIdentityLock(`${identityLockFor(target)} x`, target)).toBe(true);
      expect(startsWithIdentityLock(`${previous} x`, target)).toBe(true);
    });
  }

  it("lets video targets start from the reference when asked", () => {
    for (const target of ["veo", "omni"] as const)
      expect(identityLockFor(target)).toContain("unless this prompt asks to start from it");
  });

  it("lets image targets change hair and age when asked, never the face", () => {
    for (const target of ["nano-banana", "gpt-image"] as const) {
      expect(identityLockFor(target)).toContain("unless this prompt asks to change them");
      expect(identityLockFor(target)).toContain("exact face, facial structure and skin tone the same");
    }
  });

  it("lets Omni 1.2 follow clothing the prompt describes", () => {
    expect(identityLockFor("omni-1.2")).not.toContain("build, and clothing consistent");
    expect(identityLockFor("omni-1.2")).toContain("their clothing too unless this prompt describes other clothing");
  });
});

describe("warnings and questions", () => {
  it("treats 15 seconds, 15 second and 15-second as the same duration", () => {
    const original = "product ad, 15 seconds, three shots";
    expect(preservationWarnings(original, "A 15-second ad in three shots.", "minimal")).toEqual([]);
    expect(preservationWarnings(original, "15 second product ad.", "minimal")).toEqual([]);
    expect(preservationWarnings(original, "A product ad in three shots.", "minimal")[0]).toMatch(/15 seconds/);
  });

  it("warns when a duration exceeds the target's longest clip", () => {
    const ad = "perfume ad, 15 seconds";
    expect(preservationWarnings(ad, "Perfume ad, 15 seconds.", "minimal", "veo").join(" ")).toMatch(/at most 8 seconds/);
    expect(preservationWarnings(ad, "Perfume ad, 15 seconds.", "minimal", "omni-1.2")).toEqual([]);
  });

  it("asks the generic success and format questions only for text prompts", () => {
    const answers = { is_ambiguous: { noul: 0.9 }, lacks_constraints: { noul: 0.9 } };
    for (const kind of ["image", "video"] as const) {
      expect(mapDiagnosticAnswers(answers, { kind, engine: "test" }).unresolvedQuestions ?? []).toEqual([]);
      expect(runHeuristicDiagnostics("a cat", kind).unresolvedQuestions ?? []).toEqual([]);
    }
    expect(mapDiagnosticAnswers(answers, { kind: "user", engine: "test" }).unresolvedQuestions).toHaveLength(2);
  });

  it("tells the system optimizer to leave a conflict unresolved", () => {
    const { system } = buildOptimizerMessages("always answer in JSON. use markdown", "system");
    expect(system).toContain("add no sentence that settles the conflict");
  });
});

describe("light edit for visual prompts", () => {
  it("asks for every element a renderer needs, without new subjects or events", () => {
    const { system } = buildOptimizerMessages("a dog catches a frisbee", "video", undefined, "veo", "minimal");
    expect(system).toContain("MODE minimal (video)");
    expect(system).toContain("Add no new subjects, events, dialogue or text");
    expect(buildOptimizerMessages("fix the bug", "user").system).toContain("make the smallest useful edit");
  });
});
