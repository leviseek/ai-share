export type InstallChoice = {
  id: string;
  label: string;
  required: boolean;
  selected: boolean;
  status: string;
};

export type InstallSelectionState = {
  focusedIndex: number;
  selectedIds: ReadonlySet<string>;
  pendingInput: string;
};

export type InstallSelectionTransition = {
  state: InstallSelectionState;
  confirmed: boolean;
  cancelled: boolean;
};

export interface InstallSelectionInput {
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

export interface InstallSelectionOutput {
  readonly isTTY?: boolean;
  write(content: string): unknown;
}

type InstallSelectionKey = "up" | "down" | "toggle" | "enter" | "cancel";

const INSTALL_ARROW_SEQUENCES: readonly { sequence: string; key: "up" | "down" }[] = [
  { sequence: "\u001b[A", key: "up" },
  { sequence: "\u001b[B", key: "down" },
  { sequence: "\u001bOA", key: "up" },
  { sequence: "\u001bOB", key: "down" },
  { sequence: "\u0000H", key: "up" },
  { sequence: "\u0000P", key: "down" },
  { sequence: "\u00e0H", key: "up" },
  { sequence: "\u00e0P", key: "down" },
];

export function createInstallSelectionState(choices: readonly InstallChoice[]): InstallSelectionState {
  assertChoices(choices);
  return {
    focusedIndex: 0,
    selectedIds: new Set(choices.filter((choice) => choice.required || choice.selected).map((choice) => choice.id)),
    pendingInput: "",
  };
}

export function updateInstallSelection(
  state: InstallSelectionState,
  input: string,
  choices: readonly InstallChoice[],
): InstallSelectionTransition {
  assertChoices(choices);
  let focusedIndex = state.focusedIndex >= 0 && state.focusedIndex < choices.length ? state.focusedIndex : 0;
  const selectedIds = new Set(state.selectedIds);
  for (const choice of choices) {
    if (choice.required) selectedIds.add(choice.id);
  }
  let confirmed = false;
  let cancelled = false;
  const decoded = decodeInstallInput(`${state.pendingInput}${input}`);

  for (const key of decoded.keys) {
    if (key === "cancel") {
      cancelled = true;
      break;
    }
    if (key === "enter") {
      confirmed = true;
      break;
    }
    if (key === "up" || key === "down") {
      const offset = key === "up" ? -1 : 1;
      focusedIndex = (focusedIndex + offset + choices.length) % choices.length;
      continue;
    }
    const focusedChoice = choices[focusedIndex];
    if (focusedChoice && !focusedChoice.required) {
      if (selectedIds.has(focusedChoice.id)) selectedIds.delete(focusedChoice.id);
      else selectedIds.add(focusedChoice.id);
    }
  }

  return {
    state: { focusedIndex, selectedIds, pendingInput: decoded.pendingInput },
    confirmed,
    cancelled,
  };
}

export function renderInstallMenu(choices: readonly InstallChoice[], state: InstallSelectionState): string {
  assertChoices(choices);
  const lines = ["请选择安装内容", "", "必须安装"];
  appendChoiceLines(lines, choices, state, true);
  lines.push("", "可选安装");
  appendChoiceLines(lines, choices, state, false);
  lines.push("", "↑/↓ 移动，Space 选择或取消，Enter 确认，Ctrl+C 取消");
  return `${lines.join("\n")}\n`;
}

export async function selectInstallInteractive(
  choices: readonly InstallChoice[],
  io: { input: InstallSelectionInput; output: InstallSelectionOutput } = {
    input: process.stdin,
    output: process.stdout,
  },
): Promise<ReadonlySet<string>> {
  assertChoices(choices);
  if (!io.input.isTTY || !io.output.isTTY) throw new Error("当前终端不支持交互式安装选择。");

  const input = io.input;
  const output = io.output;
  const restoreRawMode = input.isRaw !== true;
  const wasFlowing = input.readableFlowing === true;
  let state = createInstallSelectionState(choices);
  const menuLineCount = renderInstallMenu(choices, state).split("\n").length - 1;
  const clearSequence = `\u001b[${menuLineCount}A\r\u001b[J`;

  return await new Promise<ReadonlySet<string>>((resolve, reject) => {
    let settled = false;
    let cleanedUp = false;
    let rawModeChanged = false;
    let menuVisible = false;

    const cleanup = (): Error[] => {
      if (cleanedUp) return [];
      cleanedUp = true;
      const cleanupErrors: Error[] = [];
      const attempt = (action: () => void): void => {
        try {
          action();
        } catch (error) {
          cleanupErrors.push(toError(error));
        }
      };
      attempt(() => void input.off("data", onData));
      attempt(() => void input.off("end", onEnd));
      attempt(() => void input.off("error", onError));
      if (rawModeChanged) attempt(() => void input.setRawMode(false));
      if (!wasFlowing) attempt(() => void input.pause());
      return cleanupErrors;
    };
    const clearMenu = (): Error | undefined => {
      if (!menuVisible) return undefined;
      menuVisible = false;
      try {
        output.write(clearSequence);
        return undefined;
      } catch (error) {
        return outputError(error);
      }
    };
    const finishWithError = (error: Error): void => {
      if (settled) return;
      settled = true;
      const clearError = clearMenu();
      const cleanupErrors = cleanup();
      const finalizationErrors = clearError ? [clearError, ...cleanupErrors] : cleanupErrors;
      reject(
        finalizationErrors.length > 0
          ? new AggregateError([error, ...finalizationErrors], `${error.message}；终端清理失败。`)
          : error,
      );
    };
    const finishWithSelection = (): void => {
      if (settled) return;
      settled = true;
      const clearError = clearMenu();
      const cleanupErrors = cleanup();
      const finalizationError = clearError
        ? cleanupErrors.length > 0
          ? new AggregateError([clearError, ...cleanupErrors], "安装选择结束失败。终端清理时发生多个错误。")
          : clearError
        : buildCleanupError(cleanupErrors);
      if (finalizationError) {
        reject(finalizationError);
        return;
      }
      resolve(new Set(state.selectedIds));
    };
    const writeMenu = (content: string): void => {
      try {
        output.write(content);
        menuVisible = true;
      } catch (error) {
        throw outputError(error);
      }
    };
    const rerender = (): void => {
      writeMenu(`${clearSequence}${renderInstallMenu(choices, state)}`);
    };
    const onData = (data: Buffer): void => {
      if (settled) return;
      try {
        const transition = updateInstallSelection(state, data.toString("latin1"), choices);
        state = transition.state;
        if (transition.cancelled) {
          finishWithError(new Error("已取消安装选择。"));
          return;
        }
        if (transition.confirmed) {
          finishWithSelection();
          return;
        }
        rerender();
      } catch (error) {
        finishWithError(toError(error));
      }
    };
    const onEnd = (): void => {
      if (settled) return;
      finishWithError(new Error("安装选择输入已结束。"));
    };
    const onError = (error: Error): void => {
      if (settled) return;
      finishWithError(new Error(`安装选择输入错误：${error.message}`));
    };

    try {
      if (restoreRawMode) {
        rawModeChanged = true;
        input.setRawMode(true);
      }
      input.on("data", onData);
      input.on("end", onEnd);
      input.on("error", onError);
      writeMenu(renderInstallMenu(choices, state));
      input.resume();
    } catch (error) {
      const failure = toError(error);
      finishWithError(
        failure.message.startsWith("安装选择输出失败：") ? failure : new Error(`安装选择失败：${failure.message}`),
      );
    }
  });
}

function appendChoiceLines(
  lines: string[],
  choices: readonly InstallChoice[],
  state: InstallSelectionState,
  required: boolean,
): void {
  for (const [index, choice] of choices.entries()) {
    if (choice.required !== required) continue;
    const checked = choice.required || state.selectedIds.has(choice.id);
    lines.push(
      `${index === state.focusedIndex ? ">" : " "} [${checked ? "x" : " "}] ${choice.label} (${choice.status})`,
    );
  }
}

function decodeInstallInput(input: string): { keys: InstallSelectionKey[]; pendingInput: string } {
  const keys: InstallSelectionKey[] = [];
  for (let index = 0; index < input.length; ) {
    const remaining = input.slice(index);
    const arrow = INSTALL_ARROW_SEQUENCES.find((entry) => remaining.startsWith(entry.sequence));
    if (arrow) {
      keys.push(arrow.key);
      index += arrow.sequence.length;
      continue;
    }
    if (INSTALL_ARROW_SEQUENCES.some((entry) => entry.sequence.startsWith(remaining))) {
      return { keys, pendingInput: remaining };
    }
    const character = input[index];
    if (character === "\r" || character === "\n") keys.push("enter");
    else if (character === "\u0003") keys.push("cancel");
    else if (character === " ") keys.push("toggle");
    index += 1;
  }
  return { keys, pendingInput: "" };
}

function assertChoices(choices: readonly InstallChoice[]): void {
  if (choices.length === 0) throw new Error("安装选项不能为空。");
  const ids = new Set<string>();
  for (const choice of choices) {
    if (ids.has(choice.id)) throw new Error(`安装选项 id 不能重复：${choice.id}`);
    ids.add(choice.id);
  }
}

function outputError(error: unknown): Error {
  return new Error(`安装选择输出失败：${toError(error).message}`);
}

function buildCleanupError(errors: readonly Error[]): Error | undefined {
  if (errors.length === 0) return undefined;
  if (errors.length === 1) return new Error(`安装选择清理失败：${errors[0]?.message}`, { cause: errors[0] });
  return new AggregateError(errors, "安装选择清理失败。清理终端时发生多个错误。");
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
