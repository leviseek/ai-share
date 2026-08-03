import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { WEZTERM_CONFIG_MANAGED_HEADER } from "../config/builders/wezterm.ts";
import { buildGeneratorPaths, buildWezTermPaths, type WezTermPaths } from "./paths.ts";
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

function pathsFor(root: string, name = "home"): WezTermPaths {
  return buildWezTermPaths({ HOME: resolve(root, name) });
}

async function writeTarget(paths: WezTermPaths, value: string): Promise<void> {
  await mkdir(paths.targetWezTermConfigDir, { recursive: true });
  await writeFile(paths.targetWezTermConfig, value);
}

async function createDirectoryLink(target: string, path: string): Promise<void> {
  await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function captureError(operation: Promise<unknown>): Promise<Error> {
  const result = await operation.catch((failure: unknown) => failure);
  expect(result).toBeInstanceOf(Error);
  return result as Error;
}

describe("WezTerm paths", () => {
  test("resolves HOME before USERPROFILE and targets the exact config file", () => {
    const home = resolve(tmpdir(), "ai-share-path-home");
    const profile = resolve(tmpdir(), "ai-share-path-profile");

    expect(buildWezTermPaths({ HOME: home, USERPROFILE: profile })).toEqual({
      homeDir: home,
      targetWezTermConfigDir: resolve(home, ".config", "wezterm"),
      targetWezTermConfig: resolve(home, ".config", "wezterm", "wezterm.lua"),
    });
  });

  test("uses USERPROFILE when HOME is absent and rejects a relative home", () => {
    const profile = resolve(tmpdir(), "ai-share-path-profile");

    expect(buildWezTermPaths({ USERPROFILE: profile }).homeDir).toBe(profile);
    expect(() => buildWezTermPaths({ HOME: "relative-home" })).toThrow("HOME 或 USERPROFILE 必须是绝对路径");
  });

  test("keeps existing OpenCode path behavior while sharing home resolution", () => {
    const projectRoot = resolve(tmpdir(), "ai-share-path-project");
    const home = resolve(tmpdir(), "ai-share-path-home");
    const paths = buildGeneratorPaths(projectRoot, { HOME: home });

    expect(paths.homeDir).toBe(home);
    expect(paths.targetOpenCodeConfig).toBe(resolve(home, ".config", "opencode", "opencode.jsonc"));
  });
});

describe("WezTerm ownership plan", () => {
  test("creates the exact trusted HOME target when it is missing", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const plan = await buildWezTermPlan({ paths, content, force: false });

      expect(plan).toMatchObject({
        kind: "create",
        path: resolve(paths.homeDir, ".config", "wezterm", "wezterm.lua"),
        ownership: "missing",
        reason: "target-missing",
        content,
        precondition: { target: { kind: "missing" } },
      });
    });
  });

  test("rejects a matching suffix outside the trusted HOME", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const foreignPaths = pathsFor(root, "foreign-home");
      const forgedPaths = { ...paths, targetWezTermConfig: foreignPaths.targetWezTermConfig };

      const error = await captureError(buildWezTermPlan({ paths: forgedPaths, content, force: false }));
      expect(error.message).toBe("WezTerm 输出路径必须精确匹配当前用户目录下的 .config/wezterm/wezterm.lua。");
    });
  });

  test("updates a managed file and preserves a current managed file", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      await writeTarget(paths, content);

      const update = await buildWezTermPlan({ paths, content: updatedContent, force: false });
      expect(update).toMatchObject({
        kind: "update",
        path: paths.targetWezTermConfig,
        ownership: "managed",
        reason: "managed-content-drift",
        content: updatedContent,
        precondition: { target: { kind: "file" } },
      });

      const preserve = await buildWezTermPlan({ paths, content, force: false });
      expect(preserve).toMatchObject({
        kind: "preserve",
        path: paths.targetWezTermConfig,
        ownership: "managed",
        reason: "content-current",
        precondition: { target: { kind: "file" } },
      });
      expect("content" in preserve).toBe(false);
    });
  });

  test("reports an unmanaged regular file as a collision without force", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      await writeTarget(paths, "-- user config\n");

      expect(await buildWezTermPlan({ paths, content, force: false })).toEqual({
        kind: "collision",
        path: paths.targetWezTermConfig,
        ownership: "unmanaged",
        reason: "unowned-collision",
      });
    });
  });

  test("reports target directories and links as blocking collisions even with force", async () => {
    await withTempDirectory(async (root) => {
      const directoryPaths = pathsFor(root, "directory-home");
      await mkdir(directoryPaths.targetWezTermConfig, { recursive: true });
      expect(await buildWezTermPlan({ paths: directoryPaths, content, force: true })).toMatchObject({
        kind: "collision",
        reason: "blocking-path-collision",
      });

      const linkPaths = pathsFor(root, "link-home");
      const linkTarget = resolve(root, "link-target");
      await mkdir(linkPaths.targetWezTermConfigDir, { recursive: true });
      await mkdir(linkTarget, { recursive: true });
      await createDirectoryLink(linkTarget, linkPaths.targetWezTermConfig);
      expect(await buildWezTermPlan({ paths: linkPaths, content, force: true })).toMatchObject({
        kind: "collision",
        reason: "blocking-path-collision",
      });
    });
  });

  test("does not follow a linked .config ancestor outside HOME", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const outsideConfig = resolve(root, "outside-config");
      await mkdir(paths.homeDir, { recursive: true });
      await mkdir(resolve(outsideConfig, "wezterm"), { recursive: true });
      await writeFile(resolve(outsideConfig, "wezterm", "wezterm.lua"), content);
      await createDirectoryLink(outsideConfig, resolve(paths.homeDir, ".config"));

      expect(await buildWezTermPlan({ paths, content: updatedContent, force: true })).toEqual({
        kind: "collision",
        path: paths.targetWezTermConfig,
        ownership: "unmanaged",
        reason: "blocking-path-collision",
      });
      expect(await readFile(resolve(outsideConfig, "wezterm", "wezterm.lua"), "utf8")).toBe(content);
    });
  });

  test("reports a non-directory wezterm ancestor as a blocking collision", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      await mkdir(dirname(paths.targetWezTermConfigDir), { recursive: true });
      await writeFile(paths.targetWezTermConfigDir, "blocking file\n");

      expect(await buildWezTermPlan({ paths, content, force: true })).toEqual({
        kind: "collision",
        path: paths.targetWezTermConfig,
        ownership: "unmanaged",
        reason: "blocking-path-collision",
      });
    });
  });

  test("reports a non-directory .config ancestor as a blocking collision", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      await mkdir(paths.homeDir, { recursive: true });
      await writeFile(resolve(paths.homeDir, ".config"), "blocking file\n");

      expect(await buildWezTermPlan({ paths, content, force: true })).toEqual({
        kind: "collision",
        path: paths.targetWezTermConfig,
        ownership: "unmanaged",
        reason: "blocking-path-collision",
      });
    });
  });

  test("adopts an unmanaged regular file only with force", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      await writeTarget(paths, "-- user config\n");

      expect(await buildWezTermPlan({ paths, content, force: true })).toMatchObject({
        kind: "update",
        path: paths.targetWezTermConfig,
        ownership: "unmanaged",
        reason: "force-adoption",
        content,
        precondition: { target: { kind: "file" } },
      });
    });
  });
});

describe("WezTerm plan execution", () => {
  test("writes successful create and update plans through the real staging writer", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const stagingRoot = resolve(root, "staging");
      const createPlan = await buildWezTermPlan({ paths, content, force: false });

      await executeWezTermPlan(createPlan, paths, stagingRoot);
      expect(await readFile(paths.targetWezTermConfig, "utf8")).toBe(content);

      const updatePlan = await buildWezTermPlan({ paths, content: updatedContent, force: false });
      await executeWezTermPlan(updatePlan, paths, stagingRoot);
      expect(await readFile(paths.targetWezTermConfig, "utf8")).toBe(updatedContent);
    });
  });

  test("rejects a plan whose path does not match the supplied trusted paths", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const foreignPaths = pathsFor(root, "foreign-home");
      const plan = await buildWezTermPlan({ paths, content, force: false });

      const error = await captureError(executeWezTermPlan(plan, foreignPaths, resolve(root, "staging")));
      expect(error.message).toBe("WezTerm 计划路径与当前用户目标不匹配。");
      expect(await exists(paths.targetWezTermConfig)).toBe(false);
      expect(await exists(foreignPaths.targetWezTermConfig)).toBe(false);
    });
  });

  test("refuses a stale create plan when an unmanaged file appears", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const stagingRoot = resolve(root, "staging");
      const plan = await buildWezTermPlan({ paths, content, force: false });
      await writeTarget(paths, "-- newly created user config\n");

      const error = await captureError(executeWezTermPlan(plan, paths, stagingRoot));
      expect(error.message).toContain("WezTerm 目标在计划后发生变化");
      expect(await readFile(paths.targetWezTermConfig, "utf8")).toBe("-- newly created user config\n");
      expect(await exists(stagingRoot)).toBe(false);
    });
  });

  test("refuses a stale plan when the target becomes a link", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const linkTarget = resolve(root, "link-target");
      const stagingRoot = resolve(root, "staging");
      const plan = await buildWezTermPlan({ paths, content, force: false });
      await mkdir(paths.targetWezTermConfigDir, { recursive: true });
      await mkdir(linkTarget, { recursive: true });
      await createDirectoryLink(linkTarget, paths.targetWezTermConfig);

      const error = await captureError(executeWezTermPlan(plan, paths, stagingRoot));
      expect(error.message).toContain("WezTerm 目标在计划后发生变化");
      expect(await exists(stagingRoot)).toBe(false);
    });
  });

  test("refuses a stale plan when the target becomes a blocking directory", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const stagingRoot = resolve(root, "staging");
      const plan = await buildWezTermPlan({ paths, content, force: false });
      await mkdir(paths.targetWezTermConfig, { recursive: true });

      const error = await captureError(executeWezTermPlan(plan, paths, stagingRoot));
      expect(error.message).toContain("WezTerm 目标在计划后发生变化");
      expect(await exists(stagingRoot)).toBe(false);
    });
  });

  test("refuses a stale plan when .config becomes a link", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const outsideConfig = resolve(root, "outside-config");
      const stagingRoot = resolve(root, "staging");
      const plan = await buildWezTermPlan({ paths, content, force: false });
      await mkdir(paths.homeDir, { recursive: true });
      await mkdir(outsideConfig, { recursive: true });
      await createDirectoryLink(outsideConfig, resolve(paths.homeDir, ".config"));

      const error = await captureError(executeWezTermPlan(plan, paths, stagingRoot));
      expect(error.message).toContain("WezTerm 目标在计划后发生变化");
      expect(await exists(resolve(outsideConfig, "wezterm", "wezterm.lua"))).toBe(false);
      expect(await exists(stagingRoot)).toBe(false);
    });
  });

  test("refuses a stale managed update when the original file changes", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const stagingRoot = resolve(root, "staging");
      await writeTarget(paths, content);
      const plan = await buildWezTermPlan({ paths, content: updatedContent, force: false });
      await writeFile(paths.targetWezTermConfig, `${WEZTERM_CONFIG_MANAGED_HEADER}\nreturn { concurrent = true }\n`);

      const error = await captureError(executeWezTermPlan(plan, paths, stagingRoot));
      expect(error.message).toContain("WezTerm 目标在计划后发生变化");
      expect(await readFile(paths.targetWezTermConfig, "utf8")).toContain("concurrent = true");
      expect(await exists(stagingRoot)).toBe(false);
    });
  });

  test("does not write for preserve and rejects collision before staging", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      await writeTarget(paths, content);
      const preserveStaging = resolve(root, "preserve-staging");
      const preservePlan = await buildWezTermPlan({ paths, content, force: false });

      await executeWezTermPlan(preservePlan, paths, preserveStaging);
      expect(await readFile(paths.targetWezTermConfig, "utf8")).toBe(content);
      expect(await exists(preserveStaging)).toBe(false);

      await writeFile(paths.targetWezTermConfig, "-- user config\n");
      const collisionPlan = await buildWezTermPlan({ paths, content, force: false });
      const collisionStaging = resolve(root, "collision-staging");
      const error = await captureError(executeWezTermPlan(collisionPlan, paths, collisionStaging));
      expect(error.message).toContain("WezTerm 目标存在未受管冲突");
      expect(await readFile(paths.targetWezTermConfig, "utf8")).toBe("-- user config\n");
      expect(await exists(collisionStaging)).toBe(false);
    });
  });

  test("restores the original file when executor promotion fails", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const stagingRoot = resolve(root, "staging");
      await writeTarget(paths, content);
      const plan = await buildWezTermPlan({ paths, content: updatedContent, force: false });
      let renameCalls = 0;

      const error = await captureError(
        executeWezTermPlan(plan, paths, stagingRoot, {
          rename: async (source, target) => {
            renameCalls += 1;
            if (renameCalls === 2) throw new Error("injected promotion failure");
            await rename(source, target);
          },
        }),
      );

      expect(error.message).toBe("injected promotion failure");
      expect(await readFile(paths.targetWezTermConfig, "utf8")).toBe(content);
    });
  });

  test("refuses a new unmanaged file inserted between promotion renames", async () => {
    await withTempDirectory(async (root) => {
      const paths = pathsFor(root);
      const stagingRoot = resolve(root, "staging");
      await writeTarget(paths, content);
      const plan = await buildWezTermPlan({ paths, content: updatedContent, force: false });
      let renameCalls = 0;

      const error = await captureError(
        executeWezTermPlan(plan, paths, stagingRoot, {
          rename: async (source, target) => {
            await rename(source, target);
            renameCalls += 1;
            if (renameCalls === 1) await writeFile(paths.targetWezTermConfig, "-- concurrent user file\n");
          },
        }),
      );

      expect(error.message).toContain("staged writer 提交失败且回滚失败");
      expect(await readFile(paths.targetWezTermConfig, "utf8")).toBe("-- concurrent user file\n");
    });
  });
});
