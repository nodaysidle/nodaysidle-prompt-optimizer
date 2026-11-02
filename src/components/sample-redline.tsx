/**
 * What a redline looks like, before the user has run one. Static and labelled as an
 * example: no live control, no invented run, no metric.
 */
export function SampleRedline() {
  return (
    <figure className="sample" aria-label="Example redline">
      <figcaption className="sample-title">
        Example redline <span>Not a saved run</span>
      </figcaption>
      <div className="redline">
        <p className="redline-same">Write a poem about the sea.</p>
        <section className="edit" data-state="kept">
          <p className="edit-title">
            Example edit
            <span>Kept</span>
          </p>
          <p className="edit-line">
            <span className="edit-tag">Was</span>
            <span className="edit-text edit-struck">Make it short.</span>
          </p>
          <p className="edit-line">
            <span className="edit-tag">Now</span>
            <span className="edit-text">Keep it under twelve lines.</span>
          </p>
        </section>
        <p className="redline-same">Use rhyme.</p>
      </div>
      <p className="help sample-help">
        Each block is one edit. Keep or revert it, then copy the final prompt.
      </p>
    </figure>
  );
}
