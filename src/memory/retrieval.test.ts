import { describe, expect, it } from "bun:test";
import { searchMemory } from "./retrieval.ts";

describe("searchMemory", () => {
  it("returns results for 'model' query", () => {
    const results = searchMemory("model");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.path.includes("models") || r.path.includes("stack"))).toBe(true);
    // Verify score is positive
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.snippet.length).toBeGreaterThan(0);
    }
  });

  it("returns results for Chinese query", () => {
    const results = searchMemory("上下文守卫 context guard");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((r) => r.path.includes("architecture") || r.path.includes("stack") || r.path.includes("user")),
    ).toBe(true);
  });

  it("returns results for 'profile' query", () => {
    const results = searchMemory("profile");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((r) => r.path.includes("models") || r.path.includes("profiles") || r.path.includes("user")),
    ).toBe(true);
  });

  it("returns at most 5 results", () => {
    const results = searchMemory("coding type model configuration");
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("completes within 100ms", () => {
    const start = performance.now();
    searchMemory("coding");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("returns empty array for nonsense query", () => {
    const results = searchMemory("xyznonexistentfoobar12345");
    expect(results).toEqual([]);
  });

  it("sorts by score descending", () => {
    const results = searchMemory("configuration type development");
    if (results.length >= 2) {
      for (let i = 0; i < results.length - 1; i++) {
        const current = results[i];
        const next = results[i + 1];
        if (current && next) {
          expect(current.score).toBeGreaterThanOrEqual(next.score);
        }
      }
    }
  });
});
