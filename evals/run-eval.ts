import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compareRuns, formatChanges, keptCounts, type EvalRow } from "./compare.ts";

interface SeedExpectations {
  containsAll?: string[];
  containsAny?: string[];
  lacksAny?: string[];
  preservePolish?: boolean;
  maxRatio?: number;
  noBrackets?: boolean;
  noQuestionnaire?: boolean;
  allowPreservedOriginal?: boolean;
  /** The rewrite must come back changed: an "Original kept" result fails the seed. */
  mustRewrite?: boolean;
}

interface Seed {
  name: string;
  kind: string;
  mode?: string;
  engineTarget?: string;
  prompt: string;
  expect?: SeedExpectations;
}

interface OptimizeResponse {
  optimized?: string;
  summary?: string;
  unresolvedQuestions?: string[];
  qualityGate?: {
    intentPreserved: number;
    overEngineered: number;
    passed: boolean;
    judge?: string;
    invents?: number;
    improvement?: number;
  };
  suggestedKind?: string;
  /** Present when the app kept the original: the rewrite it threw away, and why. */
  rejectedDraft?: { optimized?: string; reason?: "failed" | "marginal"; problems?: string[] };
  error?: string;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/** Keep in sync with identityLockFor in src/lib/optimizer-prompt.ts; tests/eval-sync.test.ts checks it. */
const IDENTITY_LOCKS: Record<string, string> = {
  universal:
    "Use the photo in the attachment as the only reference. Identity lock: exact likeness, facial geometry and proportions.",
  "nano-banana":
    "Use the attached photo as the identity reference for the subject. Keep the subject's exact face, facial structure and skin tone the same as in the photo, and the hair and apparent age too unless this prompt asks to change them.",
  "gpt-image":
    "Image 1 is the identity reference for the subject. Keep the subject's exact face, facial structure and skin tone the same as in Image 1, and the hair and apparent age too unless this prompt asks to change them.",
  veo:
    "Use the attached reference image as the subject reference. Keep the subject's exact face, facial structure and skin tone the same as in the reference throughout the shot, and the hair and apparent age too unless this prompt asks to change them. Use the reference for identity only, not as the opening frame, unless this prompt asks to start from it.",
  omni:
    "Use the attached image as the identity reference for the subject. Keep the subject's exact face, skin tone and build consistent throughout the video, and the hair too unless this prompt asks to change it. Use the image for identity only, not as a literal frame, unless this prompt asks to start from it.",
  "omni-1.2":
    "Use the attached reference images as identity references. Keep each referenced subject's exact face, hair, skin tone and build consistent throughout the video, and their clothing too unless this prompt describes other clothing. Do not treat the references as literal frames unless the prompt asks for that.",
};

const POLISH_DIACRITICS = /[ąćęłńóśźż]/i;

function runChecks(seed: Seed, response: OptimizeResponse): CheckResult[] {
  const checks: CheckResult[] = [];
  const optimized = (response.optimized ?? "").trim();
  const optimizedLower = optimized.toLowerCase();
  const expect = seed.expect ?? {};

  checks.push({
    name: "non-empty",
    ok: optimized.length > 0,
    detail: optimized.length > 0 ? `${optimized.length} chars` : "optimized is empty",
  });

  if (optimized.length === 0) return checks;

  const listLines = optimized
    .split("\n")
    .filter((line) => /^\s*(?:\d{1,2}[.)]|[-*•])\s/.test(line) && !line.trim().startsWith("["));
  const asksReader =
    /\?\s*$/.test(optimized.trim()) ||
    /please (?:specify|provide|answer)|provide the following|please include the following/i.test(optimized);
  const questionnaire = listLines.length >= 3 && asksReader;

  checks.push({
    name: "complete-prompt-not-questionnaire",
    ok: !questionnaire,
    detail: questionnaire
      ? `copyable prompt is a questionnaire (${listLines.length} list lines ending in a question)`
      : "prompt stays directly usable",
  });

  const ratio = optimized.length / Math.max(seed.prompt.trim().length, 1);
  const cap = expect.maxRatio ?? (seed.kind === "system" ? 12 : seed.kind === "user" ? 8 : 8);
  checks.push({
    name: "length",
    ok: ratio <= cap,
    detail: `ratio ${ratio.toFixed(2)}x (cap ${cap}x)`,
  });

  if (expect.containsAll) {
    const missing = expect.containsAll.filter((s) => !optimizedLower.includes(s.toLowerCase()));
    checks.push({
      name: "containsAll",
      ok: missing.length === 0,
      detail: missing.length === 0 ? "all present" : `missing: ${missing.join(", ")}`,
    });
  }

  if (expect.containsAny) {
    const any = expect.containsAny.some((s) => optimizedLower.includes(s.toLowerCase()));
    checks.push({ name: "containsAny", ok: any, detail: any ? "present" : "none of the expected options present" });
  }

  if (expect.lacksAny) {
    const present = expect.lacksAny.filter((s) => optimizedLower.includes(s.toLowerCase()));
    checks.push({
      name: "lacksAny",
      ok: present.length === 0,
      detail: present.length === 0 ? "clean" : `forbidden content present: ${present.join(", ")}`,
    });
  }

  if (expect.preservePolish) {
    checks.push({
      name: "polish",
      ok: POLISH_DIACRITICS.test(optimized),
      detail: POLISH_DIACRITICS.test(optimized) ? "Polish diacritics preserved" : "Polish diacritics lost",
    });
  }

  if (seed.kind === "image" || seed.kind === "video") {
    if (/^the subject (?:in|from) the photo/i.test(seed.prompt.trim())) {
      const lock = IDENTITY_LOCKS[seed.engineTarget ?? "universal"];
      checks.push({
        name: "identity-lock",
        ok: optimized.startsWith(lock),
        detail: optimized.startsWith(lock) ? "lock present" : "identity lock prefix MISSING",
      });
    }
    checks.push({
      name: "negative-prompt",
      ok: true,
      detail: "generated (not directly testable deterministically)",
    });
  }

  if (response.qualityGate) {
    checks.push({
      name: "gate",
      ok: response.qualityGate.passed,
      detail: `intent ${(response.qualityGate.intentPreserved * 100).toFixed(0)}% · verbosity ${(response.qualityGate.overEngineered * 100).toFixed(0)}% · judge ${response.qualityGate.judge ?? "?"} · ${response.qualityGate.passed ? "passed" : "FAILED"}`,
    });
  }

  return checks;
}

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

/** A lock seed's kept original comes back with the lock sentence in front, so rejectedDraft is the reliable signal. */
function isKept(seed: Seed, response: OptimizeResponse): boolean {
  return Boolean(response.rejectedDraft) || (response.optimized ?? "").trim() === seed.prompt.trim();
}

function keptNote(response: OptimizeResponse): string {
  const detail = [response.rejectedDraft?.reason, response.rejectedDraft?.problems?.[0]].filter(Boolean).join(": ");
  return ` | KEPT${detail ? ` (${detail})` : ""}`;
}

async function main() {
  const base = (process.env.EVAL_BASE_URL || "https://nodaysidle-prompt-optimizer.vercel.app").replace(/\/$/, "");
  const out = arg("out", "");
  const baselineFile = arg("baseline", "");
  const here = dirname(fileURLToPath(import.meta.url));
  const seeds = JSON.parse(readFileSync(join(here, "seeds.json"), "utf8")) as Seed[];

  console.log(`Running ${seeds.length} eval seeds against ${base}\n`);

  let passCount = 0;
  const failures: string[] = [];
  const rows: EvalRow[] = [];
  let latencyTotal = 0;

  for (const seed of seeds) {
    process.stdout.write(`· ${seed.name} [${seed.kind}${seed.engineTarget ? `/${seed.engineTarget}` : ""}] ... `);
    let response: OptimizeResponse = {};
    const startedAt = Date.now();
    try {
      const res = await fetch(`${base}/api/optimize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Run with --env-file to use your own key; without it the server must hold shared keys.
          // The access token runs the full judge chain, as the internal app does; otherwise use your own key.
          ...(process.env.APP_ACCESS_TOKEN
            ? { "x-app-access-token": process.env.APP_ACCESS_TOKEN }
            : process.env.OPENROUTER_API_KEY
              ? { "x-openrouter-key": process.env.OPENROUTER_API_KEY }
              : {}),
        },
        body: JSON.stringify({ prompt: seed.prompt, kind: seed.kind, mode: seed.mode, engineTarget: seed.engineTarget }),
      });
      const elapsed = Date.now() - startedAt;
      latencyTotal += elapsed;
      response = (await res.json()) as OptimizeResponse;
      process.stdout.write(`${(elapsed / 1000).toFixed(1)}s ... `);
      if (!res.ok) {
        console.log(`HTTP ${res.status} — ${response?.error ?? "unknown error"}`);
        failures.push(`${seed.name}: HTTP ${res.status} ${response?.error ?? ""}`);
        rows.push({ seed: seed.name, kind: seed.kind, outcome: "error", kept: false });
        continue;
      }
    } catch (err) {
      console.log(`request failed: ${err instanceof Error ? err.message : String(err)}`);
      failures.push(`${seed.name}: request failed`);
      rows.push({ seed: seed.name, kind: seed.kind, outcome: "error", kept: false });
      continue;
    }

    const kept = isKept(seed, response);
    const keptSuffix = kept ? keptNote(response) : "";
    const row: EvalRow = { seed: seed.name, kind: seed.kind, outcome: "pass", kept, keptReason: response.rejectedDraft?.reason };
    rows.push(row);

    if (seed.expect?.mustRewrite && kept) {
      const problem = response.rejectedDraft?.problems?.[0];
      console.log(`FAIL: original kept, the rewrite was rejected${problem ? ` (${problem})` : ""}`);
      failures.push(`${seed.name}: original kept${problem ? ` (${problem})` : ""}`);
      row.outcome = "fail";
      continue;
    }

    if (response.summary?.startsWith("Verification rejected both rewrites")) {
      if (seed.expect?.allowPreservedOriginal) {
        const surfaced = response.unresolvedQuestions?.length ?? 0;
        const ok = surfaced > 0;
        if (ok) {
          passCount++;
          console.log(`PRESERVED-ORIGINAL (accepted) — questions surfaced: ${surfaced} — ${response.summary.slice(0, 140)}${keptSuffix}`);
        } else {
          console.log(`PRESERVED-ORIGINAL (FAIL) — no unresolved questions surfaced with the preserved original${keptSuffix}`);
          failures.push(`${seed.name}: original preserved but unresolved questions missing`);
          row.outcome = "fail";
        }
        continue;
      }
      console.log(`PRESERVED-ORIGINAL — ${response.summary.slice(0, 220)}`);
    }

    const checks = runChecks(seed, response);
    const failed = checks.filter((c) => !c.ok);
    const notes: string[] = [];
    if (response.suggestedKind) notes.push(`suggested-kind=${response.suggestedKind}`);
    if (response.unresolvedQuestions?.length) notes.push(`questions=${response.unresolvedQuestions.length}`);

    if (failed.length === 0) {
      passCount++;
      console.log(`PASS (${checks.map((c) => c.detail).join(" | ")}${notes.length ? " | " + notes.join(", ") : ""})${keptSuffix}`);
    } else {
      row.outcome = "fail";
      console.log(`FAIL — ${failed.map((c) => `${c.name}: ${c.detail}`).join(" | ")}${notes.length ? ` | ${notes.join(", ")}` : ""}${keptSuffix}`);
      console.log(`  optimized: ${JSON.stringify(response.optimized?.slice(0, 260))}`);
      failures.push(`${seed.name}: ${failed.map((c) => `${c.name}: ${c.detail}`).join(" | ")}`);
    }
  }

  console.log(`\n${passCount}/${seeds.length} seeds passed. Avg latency ${(latencyTotal / seeds.length / 1000).toFixed(1)}s per seed.`);
  const counts = keptCounts(rows);
  console.log(
    `Original kept: ${counts.kept} of ${counts.total} (failed verification: ${counts.failed}, not clearly better: ${counts.marginal}).`,
  );
  const keptNames = rows.filter((r) => r.kept).map((r) => r.seed);
  if (keptNames.length > 0) console.log(`Kept: ${keptNames.join(", ")}`);

  if (out) writeFileSync(out, JSON.stringify({ base, date: new Date().toISOString(), rows }, null, 2));
  if (baselineFile) {
    // Informational only: a missing or broken baseline never changes the exit code.
    try {
      const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as { rows?: EvalRow[] };
      if (!Array.isArray(baseline.rows)) throw new Error("no rows array");
      console.log(`\nAgainst baseline ${baselineFile}:\n${formatChanges(compareRuns(baseline.rows, rows))}`);
    } catch (err) {
      console.log(`\nBaseline ${baselineFile} not read (${err instanceof Error ? err.message : String(err)}); skipping the comparison.`);
    }
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`- ${f}`);
    process.exit(1);
  }
}

main();
