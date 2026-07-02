import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { createMcpFixtureRepo } from "./fixtures.test.ts";
import { resolveRepositorySelection } from "./repository.ts";

describe("resolveRepositorySelection", () => {
  test("defaults to the current Codex session repository", async () => {
    const repoRoot = await createMcpFixtureRepo();
    const selection = await resolveRepositorySelection({ cwd: repoRoot });

    expect(selection.effectiveRepoRoot).toBe(resolve(repoRoot));
    expect(selection.selectionReason).toBe("session-default");
  });

  test("uses an explicit repository override", async () => {
    const defaultRoot = await createMcpFixtureRepo();
    const overrideRoot = await createMcpFixtureRepo();
    const selection = await resolveRepositorySelection({ cwd: defaultRoot, repoRoot: overrideRoot });

    expect(selection.effectiveRepoRoot).toBe(resolve(overrideRoot));
    expect(selection.defaultRepoRoot).toBe(resolve(defaultRoot));
    expect(selection.overrideRepoRoot).toBe(resolve(overrideRoot));
    expect(selection.selectionReason).toBe("explicit-override");
  });

  test("rejects a non-directory repository override", async () => {
    const defaultRoot = await createMcpFixtureRepo();
    try {
      await resolveRepositorySelection({ cwd: defaultRoot, repoRoot: join(defaultRoot, "missing") });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("repository path must be an existing directory");
    }
  });
});
