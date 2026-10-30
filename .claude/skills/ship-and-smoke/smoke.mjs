// One real optimize call against a deployment; prints the before and after.
// Usage: node --env-file=<path to .env.local> smoke.mjs [--base URL] [--kind user|system|image|video] [--mode minimal|structured|creative] "<prompt>"
// The key goes only in the request header to the deployment under test; it is never printed.
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const base = flag("base", "https://nodaysidle-prompt-optimizer.vercel.app").replace(/\/$/, "");
const kind = flag("kind", "user");
const mode = flag("mode", "minimal");
const prompt = args.join(" ").trim();
if (!prompt) throw new Error("Pass the prompt to optimize as the last argument.");

const key = process.env.OPENROUTER_API_KEY?.trim();
const token = process.env.APP_ACCESS_TOKEN?.trim();
if (!key && !token) throw new Error("Need OPENROUTER_API_KEY or APP_ACCESS_TOKEN in the env file.");

const started = Date.now();
const res = await fetch(`${base}/api/optimize`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(key ? { "x-openrouter-key": key } : { "x-app-access-token": token }),
  },
  body: JSON.stringify({ prompt, kind, mode }),
});
const body = await res.json().catch(() => ({}));
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`HTTP ${res.status} in ${seconds}s from ${base}`);
if (!res.ok || body.error) {
  console.log(`ERROR: ${body.error ?? "no JSON body"}`);
  process.exit(1);
}
console.log(`\n--- BEFORE (${kind}, ${mode}) ---\n${prompt}`);
console.log(`\n--- AFTER ---\n${body.optimized}`);
console.log(`\n--- SUMMARY ---\n${body.summary ?? "(none)"}`);
if (body.unresolvedQuestions?.length) {
  console.log(`\n--- QUESTIONS ---\n${body.unresolvedQuestions.map((q) => `• ${q}`).join("\n")}`);
}
if (body.qualityGate) console.log(`\nGATE: ${JSON.stringify(body.qualityGate)}`);
if (body.rejectedDraft) console.log("NOTE: the gate rejected a draft and kept the original.");
