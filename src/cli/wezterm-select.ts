import type { WezTermConfig } from "../types.ts";

export type WezTermSelector = (initial: WezTermConfig) => Promise<WezTermConfig>;

export type WezTermSelectionState = {
  stepIndex: number;
  selectedIndex: number;
  config: WezTermConfig;
  repositoryDefaults: WezTermConfig;
  pendingInput: string;
};

export type WezTermSelectionTransition = {
  state: WezTermSelectionState;
  completed: boolean;
  cancelled: boolean;
};

export interface WezTermSelectionInput {
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

export interface WezTermSelectionOutput {
  readonly isTTY?: boolean;
  write(content: string): unknown;
}

interface RestorableWezTermSelectionInput extends WezTermSelectionInput {
  readableFlowing: boolean | null;
}

type WezTermSelectionKey = "up" | "down" | "enter" | "cancel" | { digit: string };

type WezTermStep =
  | {
      field: "shell";
      title: "Shell";
      options: readonly { value: WezTermConfig["shell"]; label: string }[];
    }
  | {
      field: "color_scheme";
      title: "Color theme";
      options: readonly { value: WezTermConfig["color_scheme"]; label: string }[];
    }
  | {
      field: "font_size";
      title: "Font size";
      options: readonly { value: WezTermConfig["font_size"]; label: string }[];
    }
  | {
      field: "window_background_opacity";
      title: "Opacity";
      options: readonly { value: WezTermConfig["window_background_opacity"]; label: string }[];
    }
  | {
      field: "maximize_on_startup";
      title: "Startup window";
      options: readonly { value: WezTermConfig["maximize_on_startup"]; label: string }[];
    }
  | {
      field: "exit_behavior";
      title: "Exit behavior";
      options: readonly { value: WezTermConfig["exit_behavior"]; label: string }[];
    }
  | {
      field: "scrollback_lines";
      title: "Scrollback";
      options: readonly { value: WezTermConfig["scrollback_lines"]; label: string }[];
    };

const WEZTERM_STEPS: readonly WezTermStep[] = [
  {
    field: "shell",
    title: "Shell",
    options: [
      { value: "platform-native", label: "Platform native" },
      { value: "wezterm-default", label: "WezTerm default" },
    ],
  },
  {
    field: "color_scheme",
    title: "Color theme",
    options: [
      { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
      { value: "dracula", label: "Dracula" },
      { value: "tokyo-night", label: "Tokyo Night" },
      { value: "wezterm-default", label: "WezTerm default" },
    ],
  },
  {
    field: "font_size",
    title: "Font size",
    options: [
      { value: 11, label: "11" },
      { value: 12, label: "12" },
      { value: 13, label: "13" },
    ],
  },
  {
    field: "window_background_opacity",
    title: "Opacity",
    options: [
      { value: 1, label: "1.0" },
      { value: 0.94, label: "0.94" },
      { value: 0.88, label: "0.88" },
    ],
  },
  {
    field: "maximize_on_startup",
    title: "Startup window",
    options: [
      { value: false, label: "Default size" },
      { value: true, label: "Maximized" },
    ],
  },
  {
    field: "exit_behavior",
    title: "Exit behavior",
    options: [
      { value: "hold", label: "Hold" },
      { value: "close", label: "Close" },
      { value: "close-on-clean-exit", label: "Close on clean exit" },
    ],
  },
  {
    field: "scrollback_lines",
    title: "Scrollback",
    options: [
      { value: 10000, label: "10,000" },
      { value: 100000, label: "100,000" },
      { value: 1000000, label: "1,000,000" },
    ],
  },
];

const WEZTERM_ARROW_SEQUENCES: readonly { sequence: string; key: "up" | "down" }[] = [
  { sequence: "\u001b[A", key: "up" },
  { sequence: "\u001b[B", key: "down" },
  { sequence: "\u001bOA", key: "up" },
  { sequence: "\u001bOB", key: "down" },
  { sequence: "\u0000H", key: "up" },
  { sequence: "\u0000P", key: "down" },
  { sequence: "\u00e0H", key: "up" },
  { sequence: "\u00e0P", key: "down" },
];

export function createWezTermSelectionState(initial: WezTermConfig): WezTermSelectionState {
  const config = { ...initial };
  return {
    stepIndex: 0,
    selectedIndex: selectedIndexForStep(WEZTERM_STEPS[0], config),
    config,
    repositoryDefaults: { ...initial },
    pendingInput: "",
  };
}

export function updateWezTermSelection(state: WezTermSelectionState, input: string): WezTermSelectionTransition {
  let nextState = state;
  let completed = false;
  let cancelled = false;
  const decoded = decodeWezTermInput(`${state.pendingInput}${input}`);
  nextState = { ...nextState, pendingInput: decoded.pendingInput };

  for (const key of decoded.keys) {
    if (key === "cancel") {
      cancelled = true;
      break;
    }
    const choiceCount = nextState.stepIndex < WEZTERM_STEPS.length ? currentStep(nextState).options.length : 2;
    if (key === "up" || key === "down") {
      const offset = key === "up" ? -1 : 1;
      nextState = {
        ...nextState,
        selectedIndex: (nextState.selectedIndex + offset + choiceCount) % choiceCount,
      };
      continue;
    }
    if (typeof key === "object") {
      const numericIndex = Number(key.digit) - 1;
      if (numericIndex >= 0 && numericIndex < choiceCount) nextState = { ...nextState, selectedIndex: numericIndex };
      continue;
    }
    if (nextState.stepIndex === WEZTERM_STEPS.length) {
      if (nextState.selectedIndex === 0) completed = true;
      else cancelled = true;
      break;
    }

    const step = currentStep(nextState);
    const config = applySelection(nextState.config, step, nextState.selectedIndex);
    const stepIndex = nextState.stepIndex + 1;
    nextState = {
      ...nextState,
      config,
      stepIndex,
      selectedIndex: stepIndex < WEZTERM_STEPS.length ? selectedIndexForStep(WEZTERM_STEPS[stepIndex], config) : 0,
    };
  }

  return { state: nextState, completed, cancelled };
}

export function renderWezTermSelection(state: WezTermSelectionState): string {
  if (state.stepIndex === WEZTERM_STEPS.length) return renderConfirmation(state);
  const step = currentStep(state);
  const lines = [`步骤 ${state.stepIndex + 1}/${WEZTERM_STEPS.length}：${step.title}`, ""];
  const repositoryDefault = state.repositoryDefaults[step.field];
  for (const [index, option] of step.options.entries()) {
    const marker = option.value === repositoryDefault ? "（仓库默认）" : "";
    lines.push(`${index === state.selectedIndex ? ">" : " "} ${index + 1}. ${option.label}${marker}`);
  }
  lines.push("", `当前选择：${state.selectedIndex + 1}`, "↑/↓ 移动，数字选择，Enter 下一步，Ctrl+C 取消");
  return `${lines.join("\n")}\n`;
}

export async function selectWezTermConfigInteractive(
  initial: WezTermConfig,
  io: { input: RestorableWezTermSelectionInput; output: WezTermSelectionOutput } = {
    input: process.stdin,
    output: process.stdout,
  },
): Promise<WezTermConfig> {
  if (!io.input.isTTY || !io.output.isTTY) throw new Error("当前终端不支持交互式 WezTerm 配置。");

  const input = io.input;
  const output = io.output;
  const shouldRestoreRawMode = input.isRaw !== true;
  const initialFlowing = input.readableFlowing;
  let state = createWezTermSelectionState(initial);

  return await new Promise<WezTermConfig>((resolve, reject) => {
    let settled = false;
    let cleanedUp = false;
    let rawModeChanged = false;
    let visibleLineCount = 0;

    const cleanup = (): Error[] => {
      if (cleanedUp) return [];
      cleanedUp = true;
      const errors: Error[] = [];
      const attempt = (action: () => void): void => {
        try {
          action();
        } catch (error) {
          errors.push(toError(error));
        }
      };
      attempt(() => void input.off("data", onData));
      attempt(() => void input.off("end", onEnd));
      attempt(() => void input.off("error", onError));
      if (rawModeChanged) attempt(() => void input.setRawMode(false));
      if (initialFlowing === false) attempt(() => void input.pause());
      if (initialFlowing === null) {
        attempt(() => void input.pause());
        attempt(() => restoreReadableFlowing(input, null));
      }
      return errors;
    };
    const clearMenu = (): Error | undefined => {
      if (visibleLineCount === 0) return undefined;
      const lineCount = visibleLineCount;
      visibleLineCount = 0;
      try {
        output.write(`\u001b[${lineCount}A\r\u001b[J`);
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
      const finalizationErrors = clearError ? [clearError, ...cleanupErrors] : cleanupErrors;
      if (finalizationErrors.length > 0) {
        reject(new AggregateError(finalizationErrors, "WezTerm 配置结束失败。终端清理时发生错误。"));
        return;
      }
      resolve({ ...state.config });
    };
    const writeMenu = (content: string, lineCount: number): void => {
      try {
        output.write(content);
        visibleLineCount = lineCount;
      } catch (error) {
        throw outputError(error);
      }
    };
    const rerender = (): void => {
      const menu = renderWezTermSelection(state);
      const clearSequence = visibleLineCount > 0 ? `\u001b[${visibleLineCount}A\r\u001b[J` : "";
      writeMenu(`${clearSequence}${menu}`, lineCount(menu));
    };
    const onData = (data: Buffer): void => {
      if (settled) return;
      try {
        const transition = updateWezTermSelection(state, data.toString("latin1"));
        state = transition.state;
        if (transition.cancelled) {
          finishWithError(new Error("已取消 WezTerm 配置。"));
          return;
        }
        if (transition.completed) {
          finishWithSelection();
          return;
        }
        rerender();
      } catch (error) {
        finishWithError(toError(error));
      }
    };
    const onEnd = (): void => {
      if (!settled) finishWithError(new Error("WezTerm 配置输入已结束。"));
    };
    const onError = (error: Error): void => {
      if (!settled) finishWithError(new Error(`WezTerm 配置输入错误：${error.message}`));
    };

    try {
      if (shouldRestoreRawMode) {
        rawModeChanged = true;
        input.setRawMode(true);
      }
      input.on("data", onData);
      input.on("end", onEnd);
      input.on("error", onError);
      const menu = renderWezTermSelection(state);
      writeMenu(menu, lineCount(menu));
      input.resume();
    } catch (error) {
      const failure = toError(error);
      finishWithError(
        failure.message.startsWith("WezTerm 配置输出失败：")
          ? failure
          : new Error(`WezTerm 配置失败：${failure.message}`),
      );
    }
  });
}

function currentStep(state: WezTermSelectionState): WezTermStep {
  const step = WEZTERM_STEPS[state.stepIndex];
  if (!step) throw new Error("WezTerm 配置步骤无效。");
  return step;
}

function selectedIndexForStep(step: WezTermStep | undefined, config: WezTermConfig): number {
  if (!step) return 0;
  const value = config[step.field];
  const selectedIndex = step.options.findIndex((option) => option.value === value);
  return selectedIndex >= 0 ? selectedIndex : 0;
}

function applySelection(config: WezTermConfig, step: WezTermStep, selectedIndex: number): WezTermConfig {
  switch (step.field) {
    case "shell": {
      const option = step.options[selectedIndex];
      if (!option) throw new Error("WezTerm 配置选择结果无效。");
      return { ...config, shell: option.value };
    }
    case "color_scheme": {
      const option = step.options[selectedIndex];
      if (!option) throw new Error("WezTerm 配置选择结果无效。");
      return { ...config, color_scheme: option.value };
    }
    case "font_size": {
      const option = step.options[selectedIndex];
      if (!option) throw new Error("WezTerm 配置选择结果无效。");
      return { ...config, font_size: option.value };
    }
    case "window_background_opacity": {
      const option = step.options[selectedIndex];
      if (!option) throw new Error("WezTerm 配置选择结果无效。");
      return { ...config, window_background_opacity: option.value };
    }
    case "maximize_on_startup": {
      const option = step.options[selectedIndex];
      if (!option) throw new Error("WezTerm 配置选择结果无效。");
      return { ...config, maximize_on_startup: option.value };
    }
    case "exit_behavior": {
      const option = step.options[selectedIndex];
      if (!option) throw new Error("WezTerm 配置选择结果无效。");
      return { ...config, exit_behavior: option.value };
    }
    case "scrollback_lines": {
      const option = step.options[selectedIndex];
      if (!option) throw new Error("WezTerm 配置选择结果无效。");
      return { ...config, scrollback_lines: option.value };
    }
  }
}

function renderConfirmation(state: WezTermSelectionState): string {
  const config = state.config;
  const lines = [
    "配置摘要",
    "",
    `Shell: ${labelForValue(WEZTERM_STEPS[0], config.shell)}`,
    `Color theme: ${labelForValue(WEZTERM_STEPS[1], config.color_scheme)}`,
    `Font size: ${labelForValue(WEZTERM_STEPS[2], config.font_size)}`,
    `Opacity: ${labelForValue(WEZTERM_STEPS[3], config.window_background_opacity)}`,
    `Startup window: ${labelForValue(WEZTERM_STEPS[4], config.maximize_on_startup)}`,
    `Exit behavior: ${labelForValue(WEZTERM_STEPS[5], config.exit_behavior)}`,
    `Scrollback: ${labelForValue(WEZTERM_STEPS[6], config.scrollback_lines)}`,
    "",
    `${state.selectedIndex === 0 ? ">" : " "} 1. Generate`,
    `${state.selectedIndex === 1 ? ">" : " "} 2. Cancel`,
    "",
    "↑/↓ 移动，数字选择，Enter 确认，Ctrl+C 取消",
  ];
  return `${lines.join("\n")}\n`;
}

function labelForValue(step: WezTermStep | undefined, value: WezTermConfig[keyof WezTermConfig]): string {
  const label = step?.options.find((option) => option.value === value)?.label;
  if (!label) throw new Error("WezTerm 配置摘要包含无效值。");
  return label;
}

function decodeWezTermInput(input: string): { keys: WezTermSelectionKey[]; pendingInput: string } {
  const keys: WezTermSelectionKey[] = [];
  for (let index = 0; index < input.length; ) {
    const remaining = input.slice(index);
    const arrow = WEZTERM_ARROW_SEQUENCES.find((entry) => remaining.startsWith(entry.sequence));
    if (arrow) {
      keys.push(arrow.key);
      index += arrow.sequence.length;
      continue;
    }
    if (WEZTERM_ARROW_SEQUENCES.some((entry) => entry.sequence.startsWith(remaining))) {
      return { keys, pendingInput: remaining };
    }
    const character = input[index];
    if (character === "\r" || character === "\n") keys.push("enter");
    else if (character === "\u0003") keys.push("cancel");
    else if (character && /[1-9]/.test(character)) keys.push({ digit: character });
    index += 1;
  }
  return { keys, pendingInput: "" };
}

function lineCount(content: string): number {
  return content.split("\n").length - 1;
}

function outputError(error: unknown): Error {
  return new Error(`WezTerm 配置输出失败：${toError(error).message}`);
}

function restoreReadableFlowing(input: RestorableWezTermSelectionInput, value: boolean | null): void {
  input.readableFlowing = value;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
