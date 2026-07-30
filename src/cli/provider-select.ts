import type { ProviderSource } from "../types.ts";

export type ProviderChoice = {
  id: string;
  name: string;
};

export type ProviderSelectionState = {
  selectedIndex: number;
  numericInput: string;
  pendingInput: string;
};

export type ProviderSelectionTransition = {
  state: ProviderSelectionState;
  confirmed: boolean;
  cancelled: boolean;
  invalid: boolean;
};

export type ProviderSelector = (choices: readonly ProviderChoice[], initialProviderId: string) => Promise<string>;

export interface ProviderSelectionInput {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  readonly readableFlowing: boolean | null;
  setRawMode(enabled: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: "data", listener: (data: Buffer) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  off(event: "data", listener: (data: Buffer) => void): unknown;
  off(event: "end", listener: () => void): unknown;
  off(event: "error", listener: (error: Error) => void): unknown;
}

export interface ProviderSelectionOutput {
  readonly isTTY?: boolean;
  write(content: string): unknown;
}

type ProviderSelectionKey = "up" | "down" | "enter" | "cancel" | "backspace" | { digit: string };

const PROVIDER_ARROW_SEQUENCES: readonly { sequence: string; key: "up" | "down" }[] = [
  { sequence: "\u001b[A", key: "up" },
  { sequence: "\u001b[B", key: "down" },
  { sequence: "\u001bOA", key: "up" },
  { sequence: "\u001bOB", key: "down" },
  { sequence: "\u0000H", key: "up" },
  { sequence: "\u0000P", key: "down" },
  { sequence: "\u00e0H", key: "up" },
  { sequence: "\u00e0P", key: "down" },
];

export function buildProviderChoices(providers: Readonly<Record<string, ProviderSource>>): ProviderChoice[] {
  return Object.entries(providers).map(([id, provider]) => {
    const configuredName = sanitizeTerminalText(provider.name ?? "");
    return { id, name: configuredName.length > 0 ? configuredName : id };
  });
}

export function createProviderSelectionState(
  choices: readonly ProviderChoice[],
  initialProviderId: string,
): ProviderSelectionState {
  const initialIndex = choices.findIndex((choice) => choice.id === initialProviderId);
  return { selectedIndex: initialIndex >= 0 ? initialIndex : 0, numericInput: "", pendingInput: "" };
}

export function updateProviderSelection(
  state: ProviderSelectionState,
  input: string,
  choiceCount: number,
): ProviderSelectionTransition {
  if (!Number.isInteger(choiceCount) || choiceCount <= 0) throw new Error("Provider 选择列表不能为空。");
  let selectedIndex = state.selectedIndex >= 0 && state.selectedIndex < choiceCount ? state.selectedIndex : 0;
  let numericInput = state.numericInput;
  let confirmed = false;
  let cancelled = false;
  let invalid = false;
  const decoded = decodeProviderInput(`${state.pendingInput}${input}`);

  for (const key of decoded.keys) {
    if (key === "cancel") {
      cancelled = true;
      break;
    }
    if (key === "enter") {
      if (numericInput && numericSelectionIndex(numericInput, choiceCount) === undefined) {
        invalid = true;
      } else {
        confirmed = true;
      }
      break;
    }
    if (key === "up" || key === "down") {
      const offset = key === "up" ? -1 : 1;
      selectedIndex = (selectedIndex + offset + choiceCount) % choiceCount;
      numericInput = "";
      continue;
    }
    if (key === "backspace") {
      numericInput = numericInput.slice(0, -1);
      selectedIndex = numericSelectionIndex(numericInput, choiceCount) ?? selectedIndex;
      continue;
    }

    numericInput = `${numericInput}${key.digit}`;
    selectedIndex = numericSelectionIndex(numericInput, choiceCount) ?? selectedIndex;
  }

  return {
    state: { selectedIndex, numericInput, pendingInput: decoded.pendingInput },
    confirmed,
    cancelled,
    invalid,
  };
}

export function renderProviderMenu(
  choices: readonly ProviderChoice[],
  state: ProviderSelectionState,
  invalid = false,
): string {
  const lines = ["请选择 Provider（数字索引或 ↑/↓ 切换，Enter 确认，Ctrl+C 取消）"];
  for (const [index, choice] of choices.entries()) {
    lines.push(`${index === state.selectedIndex ? ">" : " "} ${index + 1}. ${choice.name} (${choice.id})`);
  }
  lines.push(
    invalid
      ? `索引无效：${state.numericInput}`
      : state.numericInput
        ? `数字索引：${state.numericInput}`
        : `当前选择：${state.selectedIndex + 1}`,
  );
  return `${lines.join("\n")}\n`;
}

export async function selectProviderInteractive(
  choices: readonly ProviderChoice[],
  initialProviderId: string,
  io: { input: ProviderSelectionInput; output: ProviderSelectionOutput } = {
    input: process.stdin,
    output: process.stdout,
  },
): Promise<string> {
  if (choices.length === 0) throw new Error("Provider 选择列表不能为空。");
  if (!io.input.isTTY || !io.output.isTTY) throw new Error("当前终端不支持交互式 Provider 选择。");

  const input = io.input;
  const output = io.output;
  const restoreRawMode = input.isRaw !== true;
  const wasFlowing = input.readableFlowing === true;
  let state = createProviderSelectionState(choices, initialProviderId);
  const menuLineCount = choices.length + 2;
  const clearSequence = `\u001b[${menuLineCount}A\r\u001b[J`;

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let cleanedUp = false;
    let rawModeChanged = false;
    let menuVisible = false;

    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      let cleanupError: Error | undefined;
      const attempt = (action: () => void): void => {
        try {
          action();
        } catch (error) {
          cleanupError ??= toError(error);
        }
      };
      attempt(() => void input.off("data", onData));
      attempt(() => void input.off("end", onEnd));
      attempt(() => void input.off("error", onError));
      if (rawModeChanged) attempt(() => void input.setRawMode(false));
      if (!wasFlowing) attempt(() => void input.pause());
      if (cleanupError) throw cleanupError;
    };
    const clearMenu = (): void => {
      if (!menuVisible) return;
      menuVisible = false;
      output.write(clearSequence);
    };
    const finishWithError = (error: Error): void => {
      if (settled) return;
      settled = true;
      try {
        clearMenu();
      } catch {
        // Preserve the original selection error while still restoring terminal state.
      }
      try {
        cleanup();
      } catch {
        // Preserve the original selection error while still rejecting the operation.
      }
      reject(error);
    };
    const finishWithSelection = (selected: ProviderChoice): void => {
      if (settled) return;
      settled = true;
      let finalizationError: Error | undefined;
      try {
        clearMenu();
      } catch (error) {
        finalizationError = toError(error);
      }
      try {
        cleanup();
      } catch (error) {
        finalizationError ??= toError(error);
      }
      if (finalizationError) {
        reject(finalizationError);
        return;
      }
      try {
        output.write(`已选择 Provider：${selected.name} (${selected.id})\n`);
      } catch (error) {
        reject(toError(error));
        return;
      }
      resolve(selected.id);
    };
    const rerender = (invalid = false): void => {
      output.write(`${clearSequence}${renderProviderMenu(choices, state, invalid)}`);
      menuVisible = true;
    };
    const onData = (data: Buffer): void => {
      try {
        const transition = updateProviderSelection(state, data.toString("utf8"), choices.length);
        state = transition.state;
        if (transition.cancelled) {
          finishWithError(new Error("已取消 Provider 选择。"));
          return;
        }
        if (transition.confirmed) {
          const selected = choices[state.selectedIndex];
          if (!selected) {
            finishWithError(new Error("Provider 选择结果无效。"));
            return;
          }
          finishWithSelection(selected);
          return;
        }
        rerender(transition.invalid);
        if (transition.invalid) output.write("\u0007");
      } catch (error) {
        finishWithError(toError(error));
      }
    };
    const onEnd = (): void => finishWithError(new Error("Provider 选择输入已结束。"));
    const onError = (error: Error): void => finishWithError(error);

    try {
      if (restoreRawMode) {
        rawModeChanged = true;
        input.setRawMode(true);
      }
      input.on("data", onData);
      input.on("end", onEnd);
      input.on("error", onError);
      menuVisible = true;
      output.write(renderProviderMenu(choices, state));
      input.resume();
    } catch (error) {
      finishWithError(toError(error));
    }
  });
}

function decodeProviderInput(input: string): { keys: ProviderSelectionKey[]; pendingInput: string } {
  const keys: ProviderSelectionKey[] = [];
  for (let index = 0; index < input.length; ) {
    const remaining = input.slice(index);
    const arrow = PROVIDER_ARROW_SEQUENCES.find((entry) => remaining.startsWith(entry.sequence));
    if (arrow) {
      keys.push(arrow.key);
      index += arrow.sequence.length;
      continue;
    }
    if (PROVIDER_ARROW_SEQUENCES.some((entry) => entry.sequence.startsWith(remaining))) {
      return { keys, pendingInput: remaining };
    }
    const character = input[index];
    if (character === undefined) break;
    if (character === "\r" || character === "\n") keys.push("enter");
    else if (character === "\u0003") keys.push("cancel");
    else if (character === "\b" || character === "\u007f") keys.push("backspace");
    else if (/\d/.test(character)) keys.push({ digit: character });
    index += 1;
  }
  return { keys, pendingInput: "" };
}

function numericSelectionIndex(input: string, choiceCount: number): number | undefined {
  if (!/^\d+$/.test(input)) return undefined;
  const index = Number(input) - 1;
  return Number.isSafeInteger(index) && index >= 0 && index < choiceCount ? index : undefined;
}

function sanitizeTerminalText(input: string): string {
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code === 0x1b && input[index + 1] === "[") {
      index += 2;
      while (index < input.length) {
        const sequenceCode = input.charCodeAt(index);
        if (sequenceCode >= 0x40 && sequenceCode <= 0x7e) break;
        index += 1;
      }
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      output += " ";
      continue;
    }
    output += input.charAt(index);
  }
  return output.replaceAll(/\s+/g, " ").trim();
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
