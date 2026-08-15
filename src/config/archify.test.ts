import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARCHIFY_DEFAULT_REF, ARCHIFY_DEFAULT_REPO, ARCHIFY_DEFAULT_SKILL } from "./schema-spec.ts";
import { loadArchifyConfig } from "./archify.ts";

describe("Archify configuration", () => {
  test("uses the pinned default when the optional source file is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-share-archify-config-default-"));
    try {
      expect(await loadArchifyConfig(root)).toEqual({
        archify: {
          repo: ARCHIFY_DEFAULT_REPO,
          skill: ARCHIFY_DEFAULT_SKILL,
          ref: ARCHIFY_DEFAULT_REF,
          enabled: true,
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("loads a valid local overlay", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-share-archify-config-overlay-"));
    try {
      await mkdir(join(root, "local"));
      await writeFile(
        join(root, "archify.yaml"),
        "archify:\n  repo: tt-a1i/archify\n  skill: archify\n  ref: cffdd42eed0ebf013aa070378d94facdd3d56b10\n  enabled: true\n",
      );
      await writeFile(join(root, "local", "archify.yaml"), "archify:\n  enabled: false\n");
      expect((await loadArchifyConfig(root)).archify.enabled).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects unsafe repository and ref values", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-share-archify-config-invalid-"));
    try {
      await writeFile(
        join(root, "archify.yaml"),
        "archify:\n  repo: https://example.test/repo\n  skill: archify\n  ref: main; rm -rf /\n  enabled: true\n",
      );
      expect(loadArchifyConfig(root)).rejects.toThrow("Archify YAML 配置校验失败");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
