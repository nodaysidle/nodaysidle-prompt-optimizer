import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface SeedExpectations {
  containsAll?: string[];
  containsAny?: string[];
  lacksAny?: string[];
  preservePolish?: boolean;
  maxRatio?: number;
  noBrackets?: boolean;
  noQuestionnaire?: boolean;
  allowPreservedOriginal?: boolean;
}

interface Seed {
  name: string;
  kind: string;
  prompt: string;
  expect?: SeedExpectations;
}

interface OptimizeResponse {
  optimized?: string;
  summary?: string;
  unresolvedQuestions?: string[];
  qualityGate?: { intentPreserved: number; overEngineered: number; passed: boolean; judge?: string };
  suggestedKind?: string;
  error?: string;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const IDENTITY_LOCK_OUTPUT =
  "Use photo in the attachment as only reference. Identity lock: exact likeness, facial geometry / proportions.";

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
    if (/^the subject in the photo/i.test(seed.prompt.trim())) {
      checks.push({
        name: "identity-lock",
        ok: optimized.startsWith(IDENTITY_LOCK_OUTPUT),
        detail: optimized.startsWith(IDENTITY_LOCK_OUTPUT) ? "lock present" : "identity lock prefix MISSING",
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

async function main() {
  const base = (process.env.EVAL_BASE_URL || "https://nodaysidle-prompt-optimizer.vercel.app").replace(/\/$/, "");
  const here = dirname(fileURLToPath(import.meta.url));
  const seeds = JSON.parse(readFileSync(join(here, "seeds.json"), "utf8")) as Seed[];

  console.log(`Running ${seeds.length} eval seeds against ${base}\n`);

  let passCount = 0;
  const failures: string[] = [];
  let latencyTotal = 0;

  for (const seed of seeds) {
    process.stdout.write(`· ${seed.name} [${seed.kind}] ... `);
    let response: OptimizeResponse = {};
    const startedAt = Date.now();
    try {
      const res = await fetch(`${base}/api/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: seed.prompt, kind: seed.kind }),
      });
      const elapsed = Date.now() - startedAt;
      latencyTotal += elapsed;
      response = (await res.json()) as OptimizeResponse;
      process.stdout.write(`${(elapsed / 1000).toFixed(1)}s ... `);
      if (!res.ok) {
        console.log(`HTTP ${res.status} — ${response?.error ?? "unknown error"}`);
        failures.push(`${seed.name}: HTTP ${res.status} ${response?.error ?? ""}`);
        continue;
      }
    } catch (err) {
      console.log(`request failed: ${err instanceof Error ? err.message : String(err)}`);
      failures.push(`${seed.name}: request failed`);
      continue;
    }

    if (response.summary?.startsWith("Verification rejected both rewrites")) {
      if (seed.expect?.allowPreservedOriginal) {
        const surfaced = response.unresolvedQuestions?.length ?? 0;
        const ok = surfaced > 0;
        if (ok) {
          passCount++;
          console.log(`PRESERVED-ORIGINAL (accepted) — questions surfaced: ${surfaced} — ${response.summary.slice(0, 140)}`);
        } else {
          console.log(`PRESERVED-ORIGINAL (FAIL) — no unresolved questions surfaced with the preserved original`);
          failures.push(`${seed.name}: original preserved but unresolved questions missing`);
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
      console.log(`PASS (${checks.map((c) => c.detail).join(" | ")}${notes.length ? " | " + notes.join(", ") : ""})`);
    } else {
      console.log(`FAIL — ${failed.map((c) => `${c.name}: ${c.detail}`).join(" | ")}${notes.length ? ` | ${notes.join(", ")}` : ""}`);
      console.log(`  optimized: ${JSON.stringify(response.optimized?.slice(0, 260))}`);
      failures.push(`${seed.name}: ${failed.map((c) => `${c.name}: ${c.detail}`).join(" | ")}`);
    }
  }

  console.log(`\n${passCount}/${seeds.length} seeds passed. Avg latency ${(latencyTotal / seeds.length / 1000).toFixed(1)}s per seed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`- ${f}`);
    process.exit(1);
  }
}

main();
