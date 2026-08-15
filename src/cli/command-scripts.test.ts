import { expect, test } from "bun:test";

type PackageJson = {
  scripts?: Record<string, string>;
};

test("package scripts expose ai:help without legacy aliases", async () => {
  const packageJson = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as PackageJson;

  expect(packageJson.scripts?.["ai:help"]).toBe("bun run ./src/cli/ai-help.ts");
  expect(packageJson.scripts?.["ai:doc"]).toBeUndefined();
  expect(packageJson.scripts?.["ai:doctor"]).toBeUndefined();
});

test("package scripts do not expose the removed terminal config command", async () => {
  const packageJson = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as PackageJson;

  expect(packageJson.scripts?.[["ai", "config"].join(":")]).toBeUndefined();
});
