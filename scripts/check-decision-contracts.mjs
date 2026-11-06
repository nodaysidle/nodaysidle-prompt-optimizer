#!/usr/bin/env node
/**
 * Fails loudly when a decision backend moves its endpoint or renames its model.
 *
 * The TypeSafe 404 was invisible because `decide()` treats every backend error as
 * "try the next one". That is the right runtime behavior, so the contract has to be
 * checked outside the request path. Run this in CI and before a release.
 *
 * No key is required for the TypeSafe OpenAPI path check. If TYPESAFE_API_KEY is
 * set, the live model list is checked too; the key is never printed.
 */
const TIMEOUT_MS = 10000;
const TYPESAFE_SPEC = "https://api.typesafe.ai/openapi.json";
const TYPESAFE_MODELS = "https://api.typesafe.ai/v1/models";
const MOUSE_DECISIONS = "https://api.mouse.dev/v1/decisions";
const OPENROUTER_DECISIONS = "https://openrouter.ai/api/alpha/decisions";

const failures = [];
const checks = [];

function pass(name, detail) {
  checks.push(`PASS ${name}: ${detail}`);
}

function fail(name, detail) {
  failures.push(`${name}: ${detail}`);
  checks.push(`FAIL ${name}: ${detail}`);
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function checkTypeSafe() {
  let response;
  try {
    response = await fetchWithTimeout(TYPESAFE_SPEC);
  } catch (error) {
    fail("typesafe-spec", `could not fetch ${TYPESAFE_SPEC}: ${error.message}`);
    return;
  }
  if (!response.ok) {
    fail("typesafe-spec", `GET ${TYPESAFE_SPEC} returned ${response.status}`);
    return;
  }
  let spec;
  try {
    spec = await response.json();
  } catch {
    fail("typesafe-spec", "response was not JSON");
    return;
  }
  if (!spec?.paths?.["/v1/systemone"]?.post) {
    fail(
      "typesafe-path",
      "POST /v1/systemone is missing; update TYPESAFE_URL and TYPESAFE_MODEL in src/lib/decisions.ts",
    );
    return;
  }
  if (!spec?.paths?.["/v1/models"]?.get) {
    fail("typesafe-models", "GET /v1/models is missing");
    return;
  }
  if (!spec?.components?.schemas?.SystemOneRequest) {
    fail("typesafe-schema", "SystemOneRequest schema is missing");
    return;
  }
  pass(
    "typesafe-path",
    "POST /v1/systemone, GET /v1/models and SystemOneRequest are present",
  );

  if (!JSON.stringify(spec).includes("jev-latest")) {
    fail(
      "typesafe-model",
      "jev-latest is not referenced by the OpenAPI document; check TYPESAFE_MODEL",
    );
    return;
  }
  pass("typesafe-model", "jev-latest is referenced by the OpenAPI document");

  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) {
    checks.push("SKIP typesafe-live: TYPESAFE_API_KEY is not set");
    return;
  }
  try {
    const live = await fetchWithTimeout(TYPESAFE_MODELS, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!live.ok) {
      fail("typesafe-live", `GET /v1/models returned ${live.status}`);
      return;
    }
    const data = await live.json();
    const names = (data?.models ?? []).map((model) => model?.name);
    if (!names.includes("jev-latest")) {
      fail(
        "typesafe-live",
        `key is valid but jev-latest is absent; saw: ${names.join(", ") || "none"}`,
      );
      return;
    }
    pass("typesafe-live", `key sees jev-latest (${names.join(", ")})`);
  } catch (error) {
    fail("typesafe-live", `live model check failed: ${error.message}`);
  }
}

/** A moved endpoint usually answers 404; auth and cold-start errors are allowed. */
async function checkEndpoint(name, url) {
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "contract-check",
        state: { prompt: "contract check" },
        questions: {
          reachable: {
            type: "noul",
            instructions: "Is this request reachable?",
          },
        },
      }),
    });
    if (response.status === 404 || response.status === 405) {
      fail(name, `POST ${url} returned ${response.status}; the endpoint moved`);
      return;
    }
    pass(name, `POST ${url} returned ${response.status}`);
  } catch (error) {
    fail(name, `could not reach ${url}: ${error.message}`);
  }
}

await checkTypeSafe();
await checkEndpoint("mouse-path", MOUSE_DECISIONS);
await checkEndpoint("openrouter-decisions-path", OPENROUTER_DECISIONS);

for (const line of checks) console.log(line);

if (failures.length) {
  console.error(`\n${failures.length} decision contract failure(s).`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} decision contract checks passed.`);
