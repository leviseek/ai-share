import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import {
  createInstallSelectionState,
  renderInstallMenu,
  selectInstallInteractive,
  updateInstallSelection,
  type InstallChoice,
  type InstallSelectionInput,
  type InstallSelectionOutput,
} from "./install-select.ts";

const choices = [
  { id: "config", label: "OpenCode 配置", required: true, selected: false, status: "将更新" },
  { id: "skills", label: "原生 Skills", required: false, selected: true, status: "已存在" },
  { id: "launcher", label: "aioc 启动器", required: false, selected: false, status: "未安装" },
] as const satisfies readonly InstallChoice[];

describe("install selection state", () => {
  test("initializes required and explicitly selected choices", () => {
    const state = createInstallSelectionState(choices);

    expect(state.focusedIndex).toBe(0);
    expect([...state.selectedIds]).toEqual(["config", "skills"]);
    expect(state.pendingInput).toBe("");
  });

  test("wraps arrow navigation in both directions", () => {
    let state = createInstallSelectionState(choices);
    state = updateInstallSelection(state, "\u001b[A", choices).state;
    expect(state.focusedIndex).toBe(2);

    state = updateInstallSelection(state, "\u001b[B", choices).state;
    expect(state.focusedIndex).toBe(0);
  });

  test("toggles optional choices with Space but never clears required choices", () => {
    let state = createInstallSelectionState(choices);
    state = updateInstallSelection(state, " ", choices).state;
    expect([...state.selectedIds]).toEqual(["config", "skills"]);

    state = updateInstallSelection(state, "\u001b[B ", choices).state;
    expect([...state.selectedIds]).toEqual(["config"]);

    state = updateInstallSelection(state, "\u001b[B ", choices).state;
    expect([...state.selectedIds]).toEqual(["config", "launcher"]);
  });

  test("confirms with Enter and cancels with Ctrl+C", () => {
    const state = createInstallSelectionState(choices);

    expect(updateInstallSelection(state, "\r", choices).confirmed).toBe(true);
    expect(updateInstallSelection(state, "\u0003", choices).cancelled).toBe(true);
  });

  test("supports ANSI, application, and Windows arrow sequences split across chunks", () => {
    const sequences = ["\u001b[A", "\u001bOA", "\u0000H", "\u00e0H"];

    for (const sequence of sequences) {
      let state = createInstallSelectionState(choices);
      state = updateInstallSelection(state, sequence.slice(0, -1), choices).state;
      expect(state.focusedIndex).toBe(0);
      expect(state.pendingInput).toBe(sequence.slice(0, -1));
      state = updateInstallSelection(state, sequence.slice(-1), choices).state;
      expect(state.focusedIndex).toBe(2);
      expect(state.pendingInput).toBe("");
    }

    for (const sequence of ["\u001b[B", "\u001bOB", "\u0000P", "\u00e0P"]) {
      const transition = updateInstallSelection(createInstallSelectionState(choices), sequence, choices);
      expect(transition.state.focusedIndex).toBe(1);
    }
  });

  test("renders required and optional groups with checkboxes, statuses, focus, and controls", () => {
    const output = renderInstallMenu(choices, createInstallSelectionState(choices));

    expect(output).toContain("必须安装");
    expect(output).toContain("> [x] OpenCode 配置 (将更新)");
    expect(output).toContain("可选安装");
    expect(output).toContain("  [x] 原生 Skills (已存在)");
    expect(output).toContain("  [ ] aioc 启动器 (未安装)");
    expect(output).toContain("↑/↓ 移动，Space 选择或取消，Enter 确认，Ctrl+C 取消");
  });

  test("renders an upgrade-specific heading and group", () => {
    const upgradeChoices = [
      { id: "opencode", label: "OpenCode CLI", required: false, selected: false, status: "已安装" },
    ];
    const state = createInstallSelectionState(upgradeChoices);
    const output = renderInstallMenu(upgradeChoices, state, "upgrade");

    expect(output).toContain("请选择升级内容");
    expect(output).toContain("可选升级");
  });

  test("keeps upgrade mode while rerendering after input", async () => {
    const upgradeChoices = [
      { id: "opencode", label: "OpenCode CLI", required: false, selected: false, status: "已安装" },
    ];
    const terminal = createTerminal();
    const selection = selectInstallInteractive(upgradeChoices, terminal.io, "upgrade");
    terminal.input.emit("data", Buffer.from(" "));
    terminal.input.emit("data", Buffer.from("\r"));
    await selection;
    const menus = terminal.rendered.split("\u001b[J");
    expect(menus.at(-2)).toContain("请选择升级内容");
    expect(menus.at(-2)).not.toContain("请选择安装内容");
  });

  test("rejects an empty choice list with a Chinese error", async () => {
    expect(() => createInstallSelectionState([])).toThrow("安装选项不能为空。");
    await expectRejected(selectInstallInteractive([]), "安装选项不能为空。");
  });

  test("rejects duplicate choice ids with a Chinese error", () => {
    const duplicateChoices = [
      { id: "config", label: "必装配置", required: true, selected: true, status: "将更新" },
      { id: "config", label: "可选配置", required: false, selected: true, status: "已存在" },
    ] as const satisfies readonly InstallChoice[];

    expect(() => createInstallSelectionState(duplicateChoices)).toThrow("安装选项 id 不能重复：config");
  });

  test("defensively restores required ids before confirmation", () => {
    const state = createInstallSelectionState(choices);
    const transition = updateInstallSelection({ ...state, selectedIds: new Set(["skills"]) }, "\r", choices);

    expect(transition.confirmed).toBe(true);
    expect([...transition.state.selectedIds]).toEqual(["skills", "config"]);
  });
});

describe("interactive install selection", () => {
  test("requires TTY input and output", async () => {
    const terminal = createTerminal({ inputTTY: false });

    await expectRejected(selectInstallInteractive(choices, terminal.io), "当前终端不支持交互式安装选择。");
  });

  test("preserves supported arrow bytes across Buffer chunks", async () => {
    const cases = [
      { bytes: [0x1b, 0x5b, 0x41], selected: ["config", "skills", "launcher"] },
      { bytes: [0x1b, 0x5b, 0x42], selected: ["config"] },
      { bytes: [0x1b, 0x4f, 0x41], selected: ["config", "skills", "launcher"] },
      { bytes: [0x1b, 0x4f, 0x42], selected: ["config"] },
      { bytes: [0x00, 0x48], selected: ["config", "skills", "launcher"] },
      { bytes: [0x00, 0x50], selected: ["config"] },
      { bytes: [0xe0, 0x48], selected: ["config", "skills", "launcher"] },
      { bytes: [0xe0, 0x50], selected: ["config"] },
    ] as const;

    for (const testCase of cases) {
      const terminal = createTerminal();
      const selection = selectInstallInteractive(choices, terminal.io);
      terminal.input.emit("data", Buffer.from(testCase.bytes.slice(0, -1)));
      terminal.input.emit("data", Buffer.from(testCase.bytes.slice(-1)));
      terminal.input.emit("data", Buffer.from(" \r"));

      expect([...(await selection)]).toEqual([...testCase.selected]);
    }
  });

  test("returns selected ids, clears ten logical menu lines, and restores terminal state", async () => {
    const terminal = createTerminal();
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("data", Buffer.from("\u001b[B \u001b[B \r"));

    expect([...(await selection)]).toEqual(["config", "launcher"]);
    expectTerminalRestored(terminal);
    const initialMenu = renderInstallMenu(choices, createInstallSelectionState(choices));
    expect(terminal.rendered).toBe(`${initialMenu}\u001b[10A\r\u001b[J`);
  });

  test("restores terminal state after cancellation", async () => {
    const terminal = createTerminal();
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("data", Buffer.from("\u0003"));

    await expectRejected(selection, "已取消安装选择。");
    expectTerminalRestored(terminal);
    expect(terminal.rendered.endsWith("\r\u001b[J")).toBe(true);
  });

  test("restores terminal state when input ends", async () => {
    const terminal = createTerminal();
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("end");

    await expectRejected(selection, "安装选择输入已结束。");
    expectTerminalRestored(terminal);
    expect(terminal.rendered.endsWith("\r\u001b[J")).toBe(true);
  });

  test("restores terminal state and reports a Chinese error when input fails", async () => {
    const terminal = createTerminal();
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("error", new Error("broken input"));

    await expectRejected(selection, "安装选择输入错误：broken input");
    expectTerminalRestored(terminal);
    expect(terminal.rendered.endsWith("\r\u001b[J")).toBe(true);
  });

  test("restores terminal state and reports a Chinese error when output fails", async () => {
    const terminal = createTerminal({ writeFailure: new Error("broken output") });

    await expectRejected(selectInstallInteractive(choices, terminal.io), "安装选择输出失败：broken output");
    expectTerminalRestored(terminal);
  });

  test("restores terminal state when clearing the menu fails", async () => {
    const terminal = createTerminal({ writeFailure: new Error("broken clear"), writeFailureAt: 2 });
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("data", Buffer.from("\r"));

    await expectRejected(selection, "安装选择输出失败：broken clear");
    expectTerminalRestored(terminal);
  });

  test("restores terminal state and reports a Chinese error when raw mode setup fails", async () => {
    const terminal = createTerminal({ rawModeFailure: new Error("broken raw mode") });

    await expectRejected(selectInstallInteractive(choices, terminal.io), "安装选择失败：broken raw mode");
    expectTerminalRestored(terminal);
  });

  test("continues cleanup after each listener removal failure and ignores settled handlers", async () => {
    for (const failedEvent of ["data", "end", "error"] as const) {
      const terminal = createTerminal({ offFailure: failedEvent });
      const selection = selectInstallInteractive(choices, terminal.io);
      terminal.input.emit("data", Buffer.from("\r"));

      await expectRejected(selection, `安装选择清理失败：broken ${failedEvent} off`);
      expect(terminal.offCalls).toEqual(["data", "end", "error"]);
      expect(terminal.rawModes).toEqual([true, false]);
      expect(terminal.pauseCalls).toBe(1);
      const renderedAfterSettlement = terminal.rendered;
      emitFailedCleanupEvent(terminal.input, failedEvent);
      expect(terminal.rendered).toBe(renderedAfterSettlement);
    }
  });

  test("continues cleanup after raw mode restoration fails", async () => {
    const terminal = createTerminal({ rawModeRestoreFailure: new Error("broken raw restore") });
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("data", Buffer.from("\r"));

    await expectRejected(selection, "安装选择清理失败：broken raw restore");
    expect(terminal.offCalls).toEqual(["data", "end", "error"]);
    expect(terminal.rawModes).toEqual([true, false]);
    expect(terminal.pauseCalls).toBe(1);
  });

  test("reports pause cleanup failure after completing prior cleanup", async () => {
    const terminal = createTerminal({ pauseFailure: new Error("broken pause") });
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("data", Buffer.from("\r"));

    await expectRejected(selection, "安装选择清理失败：broken pause");
    expect(terminal.offCalls).toEqual(["data", "end", "error"]);
    expect(terminal.rawModes).toEqual([true, false]);
    expect(terminal.pauseCalls).toBe(1);
  });

  test("does not hide cleanup errors when clearing the menu also fails", async () => {
    const terminal = createTerminal({
      writeFailure: new Error("broken clear"),
      writeFailureAt: 2,
      pauseFailure: new Error("broken pause"),
    });
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("data", Buffer.from("\r"));

    const error = await captureRejected(selection);
    expect(error).toBeInstanceOf(AggregateError);
    expect(aggregateMessages(error)).toEqual(["安装选择输出失败：broken clear", "broken pause"]);
  });

  test("aggregates cleanup failure with the original cancellation error", async () => {
    const terminal = createTerminal({ pauseFailure: new Error("broken pause") });
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("data", Buffer.from("\u0003"));

    const error = await captureRejected(selection);
    expect(error).toBeInstanceOf(AggregateError);
    expect(aggregateMessages(error)).toEqual(["已取消安装选择。", "broken pause"]);
  });

  test("preserves raw mode and flowing input when both were already enabled", async () => {
    const terminal = createTerminal({ initiallyRaw: true, initiallyFlowing: true });
    const selection = selectInstallInteractive(choices, terminal.io);
    terminal.input.emit("data", Buffer.from("\r"));

    await selection;
    expect(terminal.rawModes).toEqual([]);
    expect(terminal.pauseCalls).toBe(0);
    expect(terminal.input.readableFlowing).toBe(true);
    expect(terminal.input.listenerCount("data")).toBe(0);
    expect(terminal.input.listenerCount("end")).toBe(0);
    expect(terminal.input.listenerCount("error")).toBe(0);
  });
});

type TerminalOptions = {
  inputTTY?: boolean;
  initiallyRaw?: boolean;
  initiallyFlowing?: boolean;
  writeFailure?: Error;
  writeFailureAt?: number;
  rawModeFailure?: Error;
  rawModeRestoreFailure?: Error;
  pauseFailure?: Error;
  offFailure?: "data" | "end" | "error";
};

type TestTerminal = {
  input: PassThrough;
  io: { input: InstallSelectionInput; output: InstallSelectionOutput };
  rawModes: boolean[];
  offCalls: string[];
  readonly pauseCalls: number;
  readonly rendered: string;
};

function createTerminal(options: TerminalOptions = {}): TestTerminal {
  const input = new PassThrough();
  const output = new PassThrough();
  const originalResume = input.resume.bind(input);
  const originalPause = input.pause.bind(input);
  const originalOff = input.off.bind(input);
  const rawModes: boolean[] = [];
  const offCalls: string[] = [];
  const chunks: string[] = [];
  let rawMode = options.initiallyRaw ?? false;
  let pauseCalls = 0;
  let writeFailure = options.writeFailure;
  let writeCalls = 0;
  let rawModeFailure = options.rawModeFailure;
  let rawModeRestoreFailure = options.rawModeRestoreFailure;
  let pauseFailure = options.pauseFailure;
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
  Object.defineProperties(input, {
    isTTY: { value: options.inputTTY ?? true },
    isRaw: { get: () => rawMode },
    setRawMode: {
      value: (enabled: boolean) => {
        rawMode = enabled;
        rawModes.push(enabled);
        if (rawModeFailure) {
          const error = rawModeFailure;
          rawModeFailure = undefined;
          throw error;
        }
        if (!enabled && rawModeRestoreFailure) {
          const error = rawModeRestoreFailure;
          rawModeRestoreFailure = undefined;
          throw error;
        }
        return input;
      },
    },
    resume: { value: () => originalResume() },
    pause: {
      value: () => {
        pauseCalls += 1;
        const result = originalPause();
        if (pauseFailure) {
          const error = pauseFailure;
          pauseFailure = undefined;
          throw error;
        }
        return result;
      },
    },
    off: {
      value: (event: "data" | "end" | "error", listener: unknown) => {
        offCalls.push(event);
        if (options.offFailure === event) throw new Error(`broken ${event} off`);
        if (event === "data") return originalOff(event, listener as (data: Buffer) => void);
        if (event === "error") return originalOff(event, listener as (error: Error) => void);
        return originalOff(event, listener as () => void);
      },
    },
  });
  Object.defineProperty(output, "isTTY", { value: true });
  if (options.initiallyFlowing) input.resume();

  const terminal: TestTerminal = {
    input,
    io: {
      input: input as unknown as InstallSelectionInput,
      output: {
        isTTY: true,
        write(content: string): unknown {
          writeCalls += 1;
          if (writeFailure && writeCalls === (options.writeFailureAt ?? 1)) {
            const error = writeFailure;
            writeFailure = undefined;
            throw error;
          }
          return output.write(content);
        },
      },
    },
    rawModes,
    offCalls,
    get pauseCalls() {
      return pauseCalls;
    },
    get rendered() {
      return chunks.join("");
    },
  };
  return terminal;
}

function expectTerminalRestored(terminal: TestTerminal): void {
  expect(terminal.rawModes).toEqual([true, false]);
  expect(terminal.pauseCalls).toBe(1);
  expect(terminal.input.readableFlowing).toBe(false);
  expect(terminal.input.listenerCount("data")).toBe(0);
  expect(terminal.input.listenerCount("end")).toBe(0);
  expect(terminal.input.listenerCount("error")).toBe(0);
}

async function expectRejected(operation: Promise<unknown>, message: string): Promise<void> {
  expect((await captureRejected(operation)).message).toBe(message);
}

async function captureRejected(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`Expected Error rejection, received ${String(error)}`, { cause: error });
  }
  throw new Error("Expected operation to reject.");
}

function aggregateMessages(error: Error): string[] {
  if (!(error instanceof AggregateError)) return [];
  return (error.errors as unknown[]).map((entry) => (entry instanceof Error ? entry.message : String(entry)));
}

function emitFailedCleanupEvent(input: PassThrough, event: "data" | "end" | "error"): void {
  if (event === "data") input.emit(event, Buffer.from("\u001b[B"));
  else if (event === "error") input.emit(event, new Error("late input"));
  else input.emit(event);
}
