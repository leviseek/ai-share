import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type RuntimeManifestContract = {
  primary_stack?: string;
  model?: string;
  paths?: {
    codex_home?: string;
    codex_env?: string;
    codex_skills?: string;
  };
  managed?: {
    codex_config?: string;
    codex_env_vars?: string[];
    skills?: string[];
  };
};

const projectRoot = resolve(import.meta.dir, "..");

describe("generator install contract", () => {
  test("generates Codex and Codex user files into an isolated HOME and CODEX_HOME", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-gen-"));
    const home = join(root, "home");
    const codexHome = join(root, "codex-home");

    try {
      const result = spawnSync(process.execPath, [resolve(projectRoot, "src", "generate-user-config.ts"), "--force"], {
        cwd: projectRoot,
        encoding: "utf8",
        env: generatorEnv(home, codexHome),
      });
      if (result.status !== 0) {
        throw new Error(`generator failed with status ${result.status}\n${result.stdout}\n${result.stderr}`);
      }

      const manifest = readJson(join(codexHome, "ai-share.runtime.json")) as RuntimeManifestContract;
      expect(manifest.primary_stack).toBe("codex");
      expect(manifest.model).toBe("gpt-5.5");
      expect(manifest.paths?.codex_home).toBe(codexHome);
      expect(manifest.paths?.codex_env).toBe(join(codexHome, ".env"));
      expect(manifest.managed?.codex_config).toBe(join(codexHome, "config.toml"));
      expect(manifest.managed?.codex_env_vars).toContain("HTTP_PROXY");
      expect(manifest.managed?.skills).toContain("ai-share-generator");
      expect(manifest.managed?.skills).toContain("memory-curator");
      expect(manifest.managed?.skills).toContain("failure-distiller");
      expect(JSON.stringify(manifest).toLowerCase()).not.toContain("opencode");

      expect(readText(join(codexHome, "config.toml"))).toContain('model = "gpt-5.5"');
      expect(readText(join(codexHome, "config.toml"))).toContain('model_provider = "codexapis"');
      expect(readText(join(codexHome, "AGENTS.md"))).toContain("AI_GUIDELINES.md");
      expect(readText(join(codexHome, "AGENTS.md"))).toContain("memory");
      expect(readText(join(codexHome, ".env"))).toContain("HTTP_PROXY=http://127.0.0.1:7897");
      expect(readText(join(codexHome, ".env"))).not.toContain("CODEXAPIS_API_KEY");
      expect(existsSync(join(codexHome, "skills", "ai-share-generator", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexHome, "skills", "failure-distiller", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexHome, "skills", "memory-curator", "SKILL.md"))).toBe(true);
    } finally {
      removeGeneratedWorkspaceLink(join(home, "ai-workspace", "ai-share"));
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function generatorEnv(home: string, codexHome: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AI_SHARE_TASK: "",
    CODEX_HOME: codexHome,
    HOME: home,
    USERPROFILE: home,
  };
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function readJson(path: string): unknown {
  return JSON.parse(readText(path)) as unknown;
}

function removeGeneratedWorkspaceLink(path: string): void {
  try {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) rmSync(path, { force: true });
  } catch {
    // Missing or non-removable workspace links are cleaned up by the temp-root removal when safe.
  }
}
