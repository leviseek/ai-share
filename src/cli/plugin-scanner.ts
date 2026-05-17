import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `ai-share-plugin.json` manifest format.
 *
 * Each plugin directory under `plugins/` should contain this file.
 * It declares the plugin's identity, declared permissions, aioc compatibility,
 * and entrypoints used by the build/install pipeline.
 *
 * Fields:
 * - `name`            : Must match the plugin directory name.
 * - `version`         : Semver version string.
 * - `description`     : Short (one-line) purpose summary.
 * - `source_url`      : Where the plugin's source lives.
 * - `permissions`     : Declared capability set.  One or more of:
 *     `fs:read`         Reads filesystem paths (config, static assets, package.json, ...).
 *     `fs:write`        Writes to filesystem paths (state JSON, lockfiles, ...).
 *     `network:localhost` Makes HTTP requests to localhost (WebUI, local servers).
 *     `network:external`  Makes outbound HTTP requests (CDN, DingTalk API, ...).
 *     `exec:shell`        Spawns child processes via shell / Bun.spawn / detached scripts.
 *     `exec:bun`          Runs scripts using the Bun interpreter.
 * - `aioc_compatible` : `true` when the plugin is safe to load under `aioc` mode
 *   (native OpenCode Build/Plan without OMO orchestration).
 * - `entrypoints`     : Optional map of entrypoint kind → source file name.
 *     Supported keys: `server`, `tui`, `standalone`.
 */
export type PluginManifest = {
  name: string;
  version: string;
  description: string;
  source_url: string;
  permissions: string[];
  aioc_compatible: boolean;
  entrypoints?: Record<string, string>;
};

export type ScanResult = {
  manifest: PluginManifest | null;
  dirName: string;
  path: string;
  errors: string[];
};

/**
 * Auto-discover plugins in the `plugins/` directory by reading each
 * subdirectory's `ai-share-plugin.json` manifest.
 *
 * Directories without a manifest, or with an unparseable/invalid manifest,
 * are included in the results with `manifest: null` and `errors` populated
 * so callers can flag unknown or broken plugins.
 */
export function scanPlugins(pluginDir: string): ScanResult[] {
  const dirs = readdirSync(pluginDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  return dirs.map((dirName) => {
    const dirPath = resolve(pluginDir, dirName);
    const manifestPath = resolve(dirPath, "ai-share-plugin.json");

    if (!existsSync(manifestPath)) {
      return { manifest: null, dirName, path: dirPath, errors: ["缺少 ai-share-plugin.json"] };
    }

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PluginManifest;
      const errors: string[] = [];

      if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
        errors.push("缺少 name");
      } else if (manifest.name !== dirName) {
        errors.push(`name "${manifest.name}" 与目录名 "${dirName}" 不一致`);
      }
      if (!manifest.version || typeof manifest.version !== "string") {
        errors.push("缺少 version");
      }
      if (!Array.isArray(manifest.permissions) || manifest.permissions.length === 0) {
        errors.push("缺少 permissions");
      }
      if (typeof manifest.aioc_compatible !== "boolean") {
        errors.push("缺少 aioc_compatible");
      }

      return { manifest, dirName, path: dirPath, errors };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { manifest: null, dirName, path: dirPath, errors: [`manifest 解析失败：${message}`] };
    }
  });
}

const VALID_PERMISSIONS = new Set([
  "fs:read",
  "fs:write",
  "network:localhost",
  "network:external",
  "exec:shell",
  "exec:bun",
]);
const HIGH_RISK_PERMISSIONS = new Set(["network:external", "exec:shell", "exec:bun"]);
const MEDIUM_RISK_PERMISSIONS = new Set(["network:localhost"]);

/**
 * Format scan results as a human-readable list suitable for `ai:check` output.
 *
 * Permissions are tagged with risk indicators:
 * - ⚠  High risk (network:external, exec:shell, exec:bun)
 * - ⚡ Medium risk (network:localhost)
 * - Untagged for low risk (fs:read, fs:write)
 *
 * A summary section at the end lists all high-risk plugins.
 */
export function formatPluginScan(results: ScanResult[]): string {
  const lines: string[] = [];
  for (const result of results) {
    if (result.manifest) {
      const m = result.manifest;
      const unknownPerms = m.permissions.filter((p) => !VALID_PERMISSIONS.has(p));
      const permTags = m.permissions.map((p) => {
        if (HIGH_RISK_PERMISSIONS.has(p)) return `⚠${p}`;
        if (MEDIUM_RISK_PERMISSIONS.has(p)) return `⚡${p}`;
        return p;
      });
      const compatNote = m.aioc_compatible ? "" : " (仅 aiomo)";
      let line = `  ✓ ${m.name} v${m.version} [${permTags.join(", ")}]${compatNote}`;
      if (unknownPerms.length > 0) {
        line += ` ⚠ 未知权限：${unknownPerms.join(", ")}`;
      }
      lines.push(line);
    } else {
      lines.push(`  ⚠ ${result.dirName} — ${result.errors.join("; ")}`);
    }
  }

  // Summary — only when there is at least one manifest with a high-risk permission
  const highRiskPlugins = results.filter((r) => r.manifest?.permissions.some((p) => HIGH_RISK_PERMISSIONS.has(p)));
  if (highRiskPlugins.length > 0) {
    lines.push(
      `\n⚠ 高风险插件（${highRiskPlugins.length} 个）：${highRiskPlugins.map((r) => (r.manifest as { name: string }).name).join(", ")}`,
    );
  }

  return lines.join("\n");
}
