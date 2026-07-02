import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMcpFixtureRepo, writeFixtureSnapshot } from "./fixtures.test.ts";
import { getSnapshotStatus, loadRepositorySnapshot } from "./snapshot.ts";

describe("RIE MCP snapshot lifecycle", () => {
  test("reports missing snapshot and auto-builds it", async () => {
    const repoRoot = await createMcpFixtureRepo();

    expect((await getSnapshotStatus({ repoRoot })).status).toBe("missing");
    const loaded = await loadRepositorySnapshot({ repoRoot });

    expect(loaded.snapshot.status).toBe("current");
    expect(loaded.result.objects.length).toBeGreaterThan(0);
  });

  test("detects stale snapshots and refreshes when requested", async () => {
    const repoRoot = await createMcpFixtureRepo();
    await writeFixtureSnapshot(repoRoot);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await mkdir(join(repoRoot, "docs"), { recursive: true });
    await writeFile(join(repoRoot, "docs", "new.md"), "# New\n");

    expect((await getSnapshotStatus({ repoRoot })).status).toBe("stale");
    const loaded = await loadRepositorySnapshot({ repoRoot, refresh: true });

    expect(loaded.snapshot.status).toBe("current");
    expect(loaded.result.objects.some((object) => object.path === "docs/new.md")).toBe(true);
  });
});
