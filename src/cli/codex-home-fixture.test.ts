import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withIsolatedCodexHome<T>(fn: (codexHome: string) => Promise<T>): Promise<T> {
  const previous = Bun.env.CODEX_HOME;
  const codexHome = await mkdtemp(join(tmpdir(), "ai-share-codex-home-"));
  Bun.env.CODEX_HOME = codexHome;
  try {
    return await fn(codexHome);
  } finally {
    if (previous === undefined) delete Bun.env.CODEX_HOME;
    else Bun.env.CODEX_HOME = previous;
    await rm(codexHome, { recursive: true, force: true });
  }
}
