import type { ModelsYaml, ProviderGroupMap, ProviderSource } from "../types.ts";
import { color } from "./color.ts";

export async function selectProviderGroupsIfInteractive(
  currentProviderGroups: ProviderGroupMap,
  providers: Record<string, ProviderSource>,
  modelsConfig: ModelsYaml,
): Promise<ProviderGroupMap> {
  const providerIds = Object.keys(providers);
  const providerGroupIds = configuredProviderGroupIds(modelsConfig);
  if (providerIds.length === 0 || providerGroupIds.length === 0) return currentProviderGroups;
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    return currentProviderGroups;
  }

  const selectedProviderId = await selectProviderForGroups({
    providers,
    providerIds,
    currentProviderGroups,
  });
  const selectedProviderGroups: ProviderGroupMap = {};
  for (const groupId of providerGroupIds) {
    selectedProviderGroups[groupId] = selectedProviderId;
  }
  console.log(`${color.green("已选择 provider")}：${selectedProviderId}`);
  return selectedProviderGroups;
}

function configuredProviderGroupIds(modelsConfig: ModelsYaml): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const model of Object.values(modelsConfig)) {
    if (typeof model.provider_group !== "string" || seen.has(model.provider_group)) continue;
    seen.add(model.provider_group);
    output.push(model.provider_group);
  }
  return output;
}

async function selectProviderForGroups(input: {
  providers: Record<string, ProviderSource>;
  providerIds: string[];
  currentProviderGroups: ProviderGroupMap;
}): Promise<string> {
  const choices = input.providerIds;
  const currentDefaultProvider = input.currentProviderGroups.gpt;
  let selectedIndex = Math.max(0, choices.indexOf(currentDefaultProvider ?? ""));

  return await new Promise<string>((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let finished = false;
    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l");
    };
    const finish = (providerId: string): void => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(providerId);
    };
    const selectedChoice = (): string => choices[selectedIndex] ?? choices[0] ?? "";
    const render = (): void => {
      stdout.write("\x1b[H\x1b[2J");
      stdout.write(`${color.cyan("ai:gen provider 选择")}：${color.bold("选择一次后立即生成")}\n`);
      stdout.write("↑/↓ 切换，Enter 确认；也可按数字键或鼠标点击选择。\n\n");
      choices.forEach((providerId, index) => {
        const provider = input.providers[providerId];
        const marker = index === selectedIndex ? color.green("›") : " ";
        const label = provider?.name ?? providerId;
        const baseUrl = provider?.base_url ? ` ${provider.base_url}` : "";
        stdout.write(`${marker} ${index + 1}. ${providerId} (${label})${baseUrl}\n`);
      });
    };
    const onData = (data: Buffer): void => {
      const value = data.toString("utf8");
      if (value === "\u0003") {
        cleanup();
        process.exit(130);
      }
      if (value.includes("\r") || value.includes("\n")) {
        finish(selectedChoice());
        return;
      }
      if (value === "\x1b[A") {
        selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
        render();
        return;
      }
      if (value === "\x1b[B") {
        selectedIndex = (selectedIndex + 1) % choices.length;
        render();
        return;
      }
      const numberValue = Number(value);
      if (Number.isInteger(numberValue) && numberValue >= 1 && numberValue <= choices.length) {
        finish(choices[numberValue - 1] ?? selectedChoice());
        return;
      }

      const mouseClick = sgrMousePattern().exec(value);
      if (mouseClick?.[1]) {
        const row = Number(mouseClick[1]);
        const clickedIndex = row - 4;
        if (Number.isInteger(clickedIndex) && clickedIndex >= 0 && clickedIndex < choices.length) {
          finish(choices[clickedIndex] ?? selectedChoice());
        }
      }
    };

    stdout.write("\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
    render();
  });
}

function sgrMousePattern(): RegExp {
  return new RegExp(`${escapeSequence()}\\[<0;\\d+;(\\d+)M`);
}

function escapeSequence(): string {
  return String.fromCharCode(27);
}
