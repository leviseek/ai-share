import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

type RuntimeManifestContract = {
  primary_stack?: string;
  default_profile?: string;
  paths?: {
    codex_home?: string;
    codex_env?: string;
    bin?: string;
    codex_skills?: string;
  };
  managed?: {
    codex_profiles?: string[];
    omx_profiles?: string[];
    codex_agents?: string[];
    codex_env_vars?: string[];
    skills?: string[];
  };
};

type OmxConfigContract = {
  env?: Record<string, string>;
  models?: Record<string, string>;
};

const projectRoot = resolve(import.meta.dir, "..");

describe("generator install contract", () => {
  test("generates Codex and OMX user files into an isolated HOME and CODEX_HOME", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-share-gen-"));
    const home = join(root, "home");
    const codexHome = join(root, "codex-home");
    const targetBin = join(home, ".local", "bin");

    try {
      const result = spawnSync(process.execPath, [resolve(projectRoot, "src", "generate-user-config.ts"), "--force"], {
        cwd: projectRoot,
        encoding: "utf8",
        env: generatorEnv(home, codexHome, targetBin),
      });
      if (result.status !== 0) {
        throw new Error(`generator failed with status ${result.status}\n${result.stdout}\n${result.stderr}`);
      }

      const manifest = readJson(join(codexHome, "ai-share.runtime.json")) as RuntimeManifestContract;
      expect(manifest.primary_stack).toBe("codex+omx");
      expect(manifest.default_profile).toBe("balanced");
      expect(manifest.paths?.codex_home).toBe(codexHome);
      expect(manifest.paths?.codex_env).toBe(join(codexHome, ".env"));
      expect(manifest.paths?.bin).toBe(targetBin);
      expect(manifest.managed?.codex_profiles).toContain("coding");
      expect(manifest.managed?.omx_profiles).toEqual(manifest.managed?.codex_profiles);
      expect(manifest.managed?.codex_agents).toContain("sisyphus");
      expect(manifest.managed?.codex_env_vars).toContain("HTTP_PROXY");
      expect(manifest.managed?.skills).toContain("ai-share-generator");
      expect(JSON.stringify(manifest).toLowerCase()).not.toContain("opencode");

      expect(readText(join(codexHome, "coding.config.toml"))).toContain('model = "gpt-5.3-codex"');
      expect(readText(join(codexHome, "coding.config.toml"))).toContain('model_provider = "codexapis"');
      expect(readText(join(codexHome, "AGENTS.md"))).toContain("AI_GUIDELINES.md");
      expect(readText(join(codexHome, "AGENTS.md"))).toContain("memory");
      expect(readText(join(codexHome, ".env"))).toContain("HTTP_PROXY=http://127.0.0.1:7890");
      expect(readText(join(codexHome, ".env"))).not.toContain("CODEXAPIS_API_KEY");
      expect(existsSync(join(codexHome, "agents", "sisyphus.toml"))).toBe(true);
      expect(existsSync(join(codexHome, "skills", "git-master", "SKILL.md"))).toBe(true);

      const defaultOmx = readJson(join(codexHome, ".omx-config.json")) as OmxConfigContract;
      const codingOmx = readJson(join(codexHome, "coding.omx-config.json")) as OmxConfigContract;
      expect(defaultOmx.env?.OMX_DEFAULT_FRONTIER_MODEL).toBe("gpt-5.5");
      expect(codingOmx.env?.OMX_DEFAULT_FRONTIER_MODEL).toBe("gpt-5.3-codex");
      expect(codingOmx.models?.team_low_complexity).toBe("gpt-5.4-mini");

      for (const launcher of expectedLaunchers()) {
        expect(existsSync(join(targetBin, launcher))).toBe(true);
      }
    } finally {
      removeGeneratedWorkspaceLink(join(home, "ai-workspace", "ai-share"));
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function generatorEnv(home: string, codexHome: string, targetBin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AI_SHARE_TASK: "",
    CODEX_HOME: codexHome,
    HOME: home,
    USERPROFILE: home,
  };
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const pathValue = `${targetBin}${delimiter}${process.env[pathKey] ?? process.env.PATH ?? ""}`;
  env[pathKey] = pathValue;
  env.PATH = pathValue;
  return env;
}

function expectedLaunchers(): string[] {
  return process.platform === "win32" ? ["aiomx.cmd", "aiomx.ps1", "aiomx.ts"] : ["aiomx", "aiomx.ts"];
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
