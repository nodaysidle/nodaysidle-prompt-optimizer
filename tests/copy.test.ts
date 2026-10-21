import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("house style", () => {
  it("uses no em dash in source: interface copy and the prompts that shape the model's writing", () => {
    const offenders = files("src")
      .filter((path) => /\.(ts|tsx|css)$/.test(path))
      .filter((path) => readFileSync(path, "utf8").includes("—"));
    expect(offenders).toEqual([]);
  });
});
