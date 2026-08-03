import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WEZTERM_CONFIG_MANAGED_HEADER } from "../config/builders/wezterm.ts";
import { StagedFileWriter } from "./fs.ts";
import { buildGeneratorPaths, buildWezTermPaths } from "./paths.ts";
import { buildWezTermPlan, executeWezTermPlan } from "./wezterm-plan.ts";

const content = `${WEZTERM_CONFIG_MANAGED_HEADER}\nreturn {}\n`;
const updatedContent = `${WEZTERM_CONFIG_MANAGED_HEADER}\nreturn { updated = true }\n`;

async function withTempDirectory<T>(callback: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "ai-share-wezterm-plan-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("WezTerm paths", () => {
  test("resolves HOME before USERPROFILE and targets the exact config file", () => {
    expect(buildWezTermPaths({ HOME: "C:\\Users\\home", USERPROFILE: "C:\\Users\\profile" })).toEqual({
      homeDir: resolve("C:\\Users\\home"),
      targetWezTermConfigDir: resolve("C:\\Users\\home", ".config", "wezterm"),
      targetWezTermConfig: resolve("C:\\Users\\home", ".config", "wezterm", "wezterm.lua"),
    });
  });

  test("uses USERPROFILE when HOME is absent and rejects a relative home", () => {
    expect(buildWezTermPaths({ USERPROFILE: "C:\\Users\\profile" }).homeDir).toBe(resolve("C:\\Users\\profile"));
    expect(() => buildWezTermPaths({ HOME: "relative-home" })).toThrow("HOME 或 USERPROFILE 必须是绝对路径");
  });

  test("keeps existing OpenCode path behavior while sharing home resolution", () => {
    const paths = buildGeneratorPaths("C:\\project", { HOME: "C:\\Users\\home" });

    expect(paths.homeDir).toBe(resolve("C:\\Users\\home"));
    expect(paths.targetOpenCodeConfig).toBe(resolve("C:\\Users\\home", ".config", "opencode", "opencode.jsonc"));
  });
});

describe("WezTerm ownership plan", () => {
  test("creates the exact target when it is missing", async () => {
    await withTempDirectory(async (root) => {
      const path = buildWezTermPaths({ HOME: root }).targetWezTermConfig;

      expect(await buildWezTermPlan({ path, content, force: false })).toEqual({
        kind: "create",
        path,
        ownership: "missing",
        reason: "target-missing",
        content,
      });
    });
  });

  test("updates a managed file and preserves a current managed file", async () => {
    await withTempDirectory(async (root) => {
      const path = buildWezTermPaths({ HOME: root }).targetWezTermConfig;
      await mkdir(resolve(root, ".config", "wezterm"), { recursive: true });
      await writeFile(path, content);

      expect(await buildWezTermPlan({ path, content: updatedContent, force: false })).toEqual({
        kind: "update",
        path,
        ownership: "managed",
        reason: "managed-content-drift",
        content: updatedContent,
      });
      expect(await buildWezTermPlan({ path, content, force: false })).toEqual({
        kind: "preserve",
        path,
        ownership: "managed",
        reason: "content-current",
      });
    });
  });

  test("reports an unmanaged regular file as a collision without force", async () => {
    await withTempDirectory(async (root) => {
      const path = buildWezTermPaths({ HOME: root }).targetWezTermConfig;
      await Bun.write(path, "-- user config\n");

      expect(await buildWezTermPlan({ path, content, force: false })).toEqual({
        kind: "collision",
        path,
        ownership: "unmanaged",
        reason: "unowned-collision",
      });
    });
  });

  test("reports directories and symlinks as blocking collisions", async () => {
    await withTempDirectory(async (root) => {
      const directoryPath = buildWezTermPaths({ HOME: root }).targetWezTermConfig;
      await mkdir(directoryPath, { recursive: true });
      expect(await buildWezTermPlan({ path: directoryPath, content, force: true })).toMatchObject({
        kind: "collision",
        ownership: "unmanaged",
        reason: "blocking-path-collision",
      });

      const symlinkPath = join(root, "symlink-home", ".config", "wezterm", "wezterm.lua");
      await mkdir(join(root, "symlink-home", ".config", "wezterm"), { recursive: true });
      await mkdir(join(root, "symlink-target"), { recursive: true });
      await symlink(join(root, "symlink-target"), symlinkPath, "junction");
      expect(await buildWezTermPlan({ path: symlinkPath, content, force: true })).toMatchObject({
        kind: "collision",
        ownership: "unmanaged",
        reason: "blocking-path-collision",
      });
    });
  });

  test("adopts an unmanaged regular file only with force", async () => {
    await withTempDirectory(async (root) => {
      const path = buildWezTermPaths({ HOME: root }).targetWezTermConfig;
      await Bun.write(path, "-- user config\n");

      expect(await buildWezTermPlan({ path, content, force: true })).toEqual({
        kind: "update",
        path,
        ownership: "unmanaged",
        reason: "force-adoption",
        content,
      });
    });
  });

  test("rejects paths outside the fixed WezTerm target shape", async () => {
    const error = await buildWezTermPlan({ path: resolve("other", "wezterm.lua"), content, force: false }).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WezTerm 输出路径必须是用户目录下的 .config/wezterm/wezterm.lua");
  });
});

describe("WezTerm plan execution", () => {
  test("writes successful create and update plans through the real staging writer", async () => {
    await withTempDirectory(async (root) => {
      const path = buildWezTermPaths({ HOME: root }).targetWezTermConfig;
      const stagingRoot = join(root, "staging");
      const createPlan = await buildWezTermPlan({ path, content, force: false });

      await executeWezTermPlan(createPlan, stagingRoot);
      expect(await readFile(path, "utf8")).toBe(content);

      const updatePlan = await buildWezTermPlan({ path, content: updatedContent, force: false });
      await executeWezTermPlan(updatePlan, stagingRoot);
      expect(await readFile(path, "utf8")).toBe(updatedContent);
    });
  });

  test("does not write for preserve and rejects collision before staging", async () => {
    await withTempDirectory(async (root) => {
      const path = buildWezTermPaths({ HOME: root }).targetWezTermConfig;
      await Bun.write(path, content);
      const preservePlan = await buildWezTermPlan({ path, content, force: false });

      await executeWezTermPlan(preservePlan, join(root, "preserve-staging"));
      expect(await readFile(path, "utf8")).toBe(content);

      await Bun.write(path, "-- user config\n");
      const collisionPlan = await buildWezTermPlan({ path, content, force: false });
      const collisionError = await executeWezTermPlan(collisionPlan, join(root, "collision-staging")).catch(
        (failure: unknown) => failure,
      );
      expect(collisionError).toBeInstanceOf(Error);
      expect((collisionError as Error).message).toContain("WezTerm 目标存在未受管冲突");
      expect(await readFile(path, "utf8")).toBe("-- user config\n");
    });
  });

  test("preserves the original file when staged promotion fails", async () => {
    await withTempDirectory(async (root) => {
      const path = buildWezTermPaths({ HOME: root }).targetWezTermConfig;
      const stagingRoot = join(root, "staging");
      const original = "-- original user content\n";
      await Bun.write(path, original);
      let renameCalls = 0;
      const writer = await StagedFileWriter.create(stagingRoot, {
        rename: async (source, target) => {
          renameCalls += 1;
          if (renameCalls === 2) throw new Error("injected promotion failure");
          await rename(source, target);
        },
      });
      await writer.writeText(path, content);

      const promotionError = await writer.promote().catch((failure: unknown) => failure);
      expect(promotionError).toBeInstanceOf(Error);
      expect((promotionError as Error).message).toBe("injected promotion failure");
      expect(await readFile(path, "utf8")).toBe(original);
    });
  });
});
