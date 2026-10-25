/** Actionable defect tags the diagnostic judge flags on user/system prompts; `fix` is what the rewriter is told to do about each. */
export const DEFECT_TAGS = {
  VAGUE_OUTPUT_SCHEMA: {
    question:
      "Does `prompt` leave the shape of the answer (format, fields, sections, or length) unclear in a case where the user or a downstream consumer clearly depends on that shape?",
    fix: "State the output shape the task already implies in one line. Do not invent a schema the prompt does not imply; if the shape is truly unknown, put it in \"questions\".",
  },
  UNCONSTRAINED_SCOPE: {
    question:
      "Is the scope of `prompt` open-ended, with no boundary on what to include, exclude, or stop at, so a model could reasonably do far more or far less than the user wants?",
    fix: "Add one boundary sentence (in scope, out of scope, where to stop) using only facts the prompt supports; otherwise put the missing boundary in \"questions\".",
  },
  NEGATIVE_PROMPTING_SLOP: {
    question:
      "Does `prompt` lean on piles of vague 'don't' or 'never' prohibitions and filler warnings where a positive instruction would say the same thing better?",
    fix: "Turn vague prohibitions into the positive behavior wanted. Keep hard exclusions the user stated verbatim.",
  },
  EXCESSIVE_PERSONA_BLOAT: {
    question:
      "Does `prompt` spend lines on inflated persona or credentials (for example 'world-class expert with 20 years of experience') that do not change what the model should do?",
    fix: "Cut inflated persona lines down to the role that actually governs behavior, or remove them. Keep any role the task needs.",
  },
} as const;

export type DefectTag = keyof typeof DEFECT_TAGS;
export const DEFECT_TAG_LIST = Object.keys(DEFECT_TAGS) as DefectTag[];
