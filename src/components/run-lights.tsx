export type RunStage = "idle" | "sent" | "diagnose" | "rewrite" | "verify" | "repair";

/** How many lamps are lit at each stage. The fifth only lights when a second pass was needed. */
const LIT: Record<RunStage, number> = {
  idle: 0,
  sent: 1,
  diagnose: 2,
  rewrite: 3,
  verify: 4,
  repair: 5,
};

export const STAGE_LABEL: Record<RunStage, string> = {
  idle: "",
  sent: "Sending your prompt",
  diagnose: "Reading your prompt",
  rewrite: "Rewriting",
  verify: "Checking the rewrite",
  repair: "Second pass: fixing what the check flagged",
};

/**
 * Five lamps, driven only by stages the server reports. They never advance on a timer,
 * and they go out when the result arrives.
 */
export function RunLights({ stage }: { stage: RunStage }) {
  const lit = LIT[stage];
  return (
    <div className="lights">
      <div className="lamps" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((lamp) => (
          <span key={lamp} className="lamp" data-on={lamp <= lit} />
        ))}
      </div>
      <p className="lights-label" role="status">
        {STAGE_LABEL[stage]}
      </p>
    </div>
  );
}
