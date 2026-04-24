#!/usr/bin/env bun

import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readlink, rm, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type ShareMode = "link" | "copy";

const args = new Set(Bun.argv.slice(2));
const force = args.has("--force");
const mode: ShareMode = args.has("--copy") ? "copy" : "link";

const projectRoot = resolve(import.meta.dir, "..");
const sourceConfig = resolve(projectRoot, "opencode.jsonc");
const targetConfig = resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "", ".config", "opencode", "opencode.jsonc");

if (!targetConfig.startsWith(resolve(Bun.env.HOME ?? Bun.env.USERPROFILE ?? ""))) {
  throw new Error("Cannot resolve user home directory for OpenCode config path.");
}

await ensureReadable(sourceConfig);
await mkdir(dirname(targetConfig), { recursive: true });
const effectiveMode = await installConfig(sourceConfig, targetConfig, mode, force);

console.log(`Shared OpenCode config: ${targetConfig}`);
console.log(`Source: ${sourceConfig}`);
console.log(`Mode: ${effectiveMode}`);

async function ensureReadable(path: string): Promise<void> {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Missing readable config file: ${path}`);
  }
}

async function installConfig(source: string, target: string, requestedMode: ShareMode, overwrite: boolean): Promise<ShareMode | "already-linked" | "already-copied"> {
  const existing = await getExistingTarget(target);

  if (existing) {
    if (existing.linkTarget && resolve(dirname(target), existing.linkTarget) === source) {
      console.log("OpenCode config is already linked to this repository.");
      return "already-linked";
    }

    if (!existing.linkTarget && (await hasSameContent(source, target))) {
      console.log("OpenCode config is already copied from this repository.");
      return "already-copied";
    }

    if (!overwrite) {
      throw new Error(
        `Target already exists: ${target}\n` +
          "Run `bun run share -- --force` to replace it, or `bun run share -- --copy --force` to copy instead of linking.",
      );
    }

    await rm(target, { force: true });
  }

  if (requestedMode === "copy") {
    await copyFile(source, target);
    return "copy";
  }

  try {
    await symlink(source, target, "file");
    return "link";
  } catch (error) {
    console.warn(`Could not create symlink, falling back to copy: ${formatError(error)}`);
    await copyFile(source, target);
    return "copy";
  }
}

async function hasSameContent(left: string, right: string): Promise<boolean> {
  try {
    const [leftContent, rightContent] = await Promise.all([readFile(left, "utf8"), readFile(right, "utf8")]);
    return leftContent === rightContent;
  } catch {
    return false;
  }
}

async function getExistingTarget(path: string): Promise<{ linkTarget?: string } | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) return {};
    return { linkTarget: await readlink(path) };
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
