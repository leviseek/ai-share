import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanOpenCodeConfig } from "./clean.ts";
import { buildGeneratorPaths } from "./paths.ts";

describe("cleanOpenCodeConfig", () => {
  test("cleans a managed external skill from the Skills CLI global directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-share-clean-global-skill-"));
    try {
      const paths = buildGeneratorPaths(root, {
        HOME: join(root, "home"),
        OPENCODE_CONFIG_DIR: join(root, "opencode"),
      });
      const skillDir = join(paths.targetGlobalSkillsDir, "archify");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, ".ai-share-managed"), "ai-share\n");
      await writeFile(join(skillDir, "SKILL.md"), "# Archify\n");

      const result = await cleanOpenCodeConfig(paths, { backup: false });
      expect(result.changed).toContain(skillDir);
      expect(readFile(join(skillDir, "SKILL.md"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
