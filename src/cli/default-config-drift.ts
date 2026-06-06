import { readFile } from "node:fs/promises";
import { pathExists } from "./fs.ts";

export type DefaultConfigDrift =
  | {
      status: "missing";
      path: string;
    }
  | {
      status: "current";
      path: string;
    }
  | {
      status: "drifted";
      path: string;
    };

export async function detectDefaultConfigDrift(path: string, expectedContent: string): Promise<DefaultConfigDrift> {
  if (!(await pathExists(path))) return { status: "missing", path };

  const actualContent = await readFile(path, "utf8");
  if (normalizeConfigText(actualContent) === normalizeConfigText(expectedContent)) {
    return { status: "current", path };
  }

  return { status: "drifted", path };
}

function normalizeConfigText(content: string): string {
  return `${content.replaceAll("\r\n", "\n").trimEnd()}\n`;
}
