/**
 * Pairwise quality judge for the optimizer.
 *
 * The containment checks in run-eval.ts prove the output did not break (quoted text kept,
 * no questionnaire, length cap). They cannot say whether the rewrite is better. This does:
 * for each seed it runs the optimizer, then asks a DIFFERENT model than the rewriter to
 * compare the original and the rewrite in a random order and say which is more likely to
 * get the writer what they wanted, whether the rewrite invents requirements, and how
 * bloated it is. Order is fixed per seed, so a before and an after run are comparable.
 *
 * Usage:
 *   node --env-file=.env.local evals/judge.ts [--base URL] [--out file.json]
 * Needs OPENROUTER_API_KEY in the environment. It is sent only to openrouter.ai and to
 * the optimizer under test as the caller's own key; it is never printed or written.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const JUDGE_MODEL = "google/gemini-2.5-flash";

interface Seed {
  name: string;
  kind: "user" | "system" | "image" | "video";
  mode?: "minimal" | "structured" | "creative";
  prompt: string;
}
interface Optimized {
  optimized?: string;
  summary?: string;
  rejectedDraft?: unknown;
  error?: string;
}
interface Verdict {
  better: "original" | "rewrite" | "tie";
  invents: boolean;
  bloat: number;
  reason: string;
}

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

/** Small deterministic generator so each seed always lands on the same side. */
function coin(seedIndex: number): boolean {
  let x = (seedIndex + 1) * 2654435761;
  x ^= x >>> 15;
  return (x & 1) === 1;
}

const RUBRIC = `You compare two versions of a prompt that a person wrote for an AI model.
You are given the kind of prompt and two versions, X and Y. Decide, as a careful prompt engineer:
1. better: which version is more likely to get the writer the result they wanted from the target model. Answer "X", "Y" or "tie". Answer "tie" if they are about equally good or the differences are cosmetic. Do not prefer the longer one for being longer.
2. y_invents: does version Y add requirements, facts, names or constraints that version X does not state and the writer never asked for? true or false.
3. x_invents: the same question for version X.
4. y_bloat and x_bloat: how padded or over-structured is each, from 1 (tight) to 5 (bloated with filler).
Reply with one JSON object: {"better":"X|Y|tie","x_invents":bool,"y_invents":bool,"x_bloat":int,"y_bloat":int,"reason":"one sentence"}.`;

async function judge(
  seed: Seed,
  original: string,
  rewrite: string,
  rewriteIsX: boolean,
  key: string,
): Promise<Verdict> {
  const x = rewriteIsX ? rewrite : original;
  const y = rewriteIsX ? original : rewrite;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: RUBRIC },
        { role: "user", content: `Kind: ${seed.kind}\n\n<X>\n${x}\n</X>\n\n<Y>\n${y}\n</Y>` },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`judge request failed (${response.status})`);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
    better?: string;
    x_invents?: boolean;
    y_invents?: boolean;
    x_bloat?: number;
    y_bloat?: number;
    reason?: string;
  };
  const pick = raw.better === "X" ? "x" : raw.better === "Y" ? "y" : "tie";
  const better =
    pick === "tie" ? "tie" : (pick === "x") === rewriteIsX ? "rewrite" : "original";
  return {
    better,
    invents: Boolean(rewriteIsX ? raw.x_invents : raw.y_invents),
    bloat: Number(rewriteIsX ? raw.x_bloat : raw.y_bloat) || 0,
    reason: String(raw.reason ?? "").slice(0, 300),
  };
}

async function main() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set (run with --env-file).");
  const base = arg("base", "https://nodaysidle-prompt-optimizer.vercel.app").replace(/\/$/, "");
  const out = arg("out", "");
  const here = dirname(fileURLToPath(import.meta.url));
  const seeds = JSON.parse(readFileSync(join(here, "seeds.json"), "utf8")) as Seed[];

  console.log(`Judging ${seeds.length} seeds from ${base} with ${JUDGE_MODEL}\n`);
  const rows: Record<string, unknown>[] = [];
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let invented = 0;
  let bloatTotal = 0;
  let latencyTotal = 0;
  let kept = 0;
  let failed = 0;

  for (const [index, seed] of seeds.entries()) {
    process.stdout.write(`· ${seed.name} [${seed.kind}] ... `);
    const started = Date.now();
    try {
      const response = await fetch(`${base}/api/optimize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The caller's own key: works the same on the old and new deployments.
          "x-openrouter-key": key,
        },
        body: JSON.stringify({ prompt: seed.prompt, kind: seed.kind, mode: seed.mode }),
        signal: AbortSignal.timeout(120000),
      });
      const elapsed = Date.now() - started;
      latencyTotal += elapsed;
      const data = (await response.json()) as Optimized;
      if (!response.ok || !data.optimized) throw new Error(data.error || `HTTP ${response.status}`);

      const unchanged = data.optimized.trim() === seed.prompt.trim();
      if (unchanged) kept++;
      const verdict = unchanged
        ? ({ better: "tie", invents: false, bloat: 1, reason: "Original returned unchanged." } as Verdict)
        : await judge(seed, seed.prompt, data.optimized, coin(index), key);
      if (verdict.better === "rewrite") wins++;
      else if (verdict.better === "original") losses++;
      else ties++;
      if (verdict.invents) invented++;
      bloatTotal += verdict.bloat;
      console.log(
        `${(elapsed / 1000).toFixed(1)}s ${unchanged ? "kept" : verdict.better}${verdict.invents ? " INVENTS" : ""} bloat ${verdict.bloat}`,
      );
      rows.push({ seed: seed.name, kind: seed.kind, elapsedMs: elapsed, unchanged, ...verdict, original: seed.prompt, optimized: data.optimized });
    } catch (error) {
      failed++;
      console.log(`failed: ${error instanceof Error ? error.message : String(error)}`);
      rows.push({ seed: seed.name, kind: seed.kind, failed: true });
    }
  }

  const judged = seeds.length - failed;
  const summary = {
    base,
    judge: JUDGE_MODEL,
    seeds: seeds.length,
    failed,
    rewriteWins: wins,
    originalWins: losses,
    ties,
    keptOriginal: kept,
    winRate: judged ? Number(((wins + ties / 2) / judged).toFixed(2)) : 0,
    inventedRequirements: invented,
    averageBloat: judged ? Number((bloatTotal / judged).toFixed(2)) : 0,
    averageLatencySeconds: judged ? Number((latencyTotal / judged / 1000).toFixed(1)) : 0,
  };
  console.log("\n" + JSON.stringify(summary, null, 2));
  if (out) writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
