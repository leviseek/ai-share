import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { WezTermConfig } from "../types.ts";
import { createColor } from "./color.ts";
import {
  createWezTermSelectionState,
  renderWezTermSelection,
  selectWezTermConfigInteractive,
  updateWezTermSelection,
  type WezTermSelectionInput,
  type WezTermSelectionOutput,
} from "./wezterm-select.ts";

const defaults: WezTermConfig = {
  shell: "platform-native",
  color_scheme: "catppuccin-mocha",
  font_size: 12,
  window_background_opacity: 0.94,
  maximize_on_startup: false,
  exit_behavior: "hold",
  scrollback_lines: 100000,
};

class TestInput implements WezTermSelectionInput {
  readonly isTTY?: boolean;
  isRaw?: boolean;
  readableFlowing: boolean | null;
  readonly rawModeCalls: boolean[] = [];
  resumeCalls = 0;
  pauseCalls = 0;
  private readonly failEnablingRawMode: boolean;
  private readonly listeners = {
    data: new Set<(data: Buffer) => void>(),
    end: new Set<() => void>(),
    error: new Set<(error: Error) => void>(),
  };

  constructor(
    options: { isTTY?: boolean; isRaw?: boolean; readableFlowing?: boolean | null; failEnablingRawMode?: boolean } = {},
  ) {
    this.isTTY = options.isTTY ?? true;
    this.isRaw = options.isRaw ?? false;
    this.readableFlowing = options.readableFlowing === undefined ? false : options.readableFlowing;
    this.failEnablingRawMode = options.failEnablingRawMode ?? false;
  }

  setRawMode(enabled: boolean): void {
    this.rawModeCalls.push(enabled);
    this.isRaw = enabled;
    if (enabled && this.failEnablingRawMode) throw new Error("raw mode unavailable");
  }

  resume(): void {
    this.resumeCalls += 1;
    this.readableFlowing = true;
  }

  pause(): void {
    this.pauseCalls += 1;
    this.readableFlowing = false;
  }

  on(event: "data" | "end" | "error", listener: ((data: Buffer) => void) | (() => void) | ((error: Error) => void)) {
    if (event === "data") {
      this.listeners.data.add(listener as (data: Buffer) => void);
      this.readableFlowing = true;
    } else if (event === "end") this.listeners.end.add(listener as () => void);
    else this.listeners.error.add(listener as (error: Error) => void);
    return this;
  }

  off(event: "data" | "end" | "error", listener: ((data: Buffer) => void) | (() => void) | ((error: Error) => void)) {
    if (event === "data") this.listeners.data.delete(listener as (data: Buffer) => void);
    else if (event === "end") this.listeners.end.delete(listener as () => void);
    else this.listeners.error.delete(listener as (error: Error) => void);
    return this;
  }

  emitData(content: string): void {
    for (const listener of this.listeners.data) listener(Buffer.from(content, "latin1"));
  }

  emitEnd(): void {
    for (const listener of this.listeners.end) listener();
  }

  emitError(error: Error): void {
    for (const listener of this.listeners.error) listener(error);
  }

  listenerCount(): number {
    return this.listeners.data.size + this.listeners.end.size + this.listeners.error.size;
  }
}

class TestOutput implements WezTermSelectionOutput {
  readonly isTTY?: boolean;
  readonly writes: string[] = [];
  private writeCount = 0;

  constructor(options: { isTTY?: boolean; failAt?: number } = {}) {
    this.isTTY = options.isTTY ?? true;
    this.failAt = options.failAt ?? Number.POSITIVE_INFINITY;
  }

  private readonly failAt: number;

  write(content: string): void {
    this.writeCount += 1;
    if (this.writeCount === this.failAt) throw new Error("broken output");
    this.writes.push(content);
  }
}

function advanceToConfirmation() {
  return updateWezTermSelection(createWezTermSelectionState(defaults), "\r\r\r\r\r\r\r").state;
}

describe("WezTerm wizard state", () => {
  test("wraps arrow navigation in both directions", () => {
    const initial = createWezTermSelectionState(defaults);
    const wrappedUp = updateWezTermSelection(initial, "\u001b[A");
    const wrappedDown = updateWezTermSelection(wrappedUp.state, "\u001b[B");

    expect(wrappedUp.state.selectedIndex).toBe(1);
    expect(wrappedDown.state.selectedIndex).toBe(0);
  });

  test("uses a numeric choice when Enter advances to the next screen", () => {
    const transition = updateWezTermSelection(createWezTermSelectionState(defaults), "2\r");

    expect(transition.state.stepIndex).toBe(1);
    expect(transition.state.config.shell).toBe("wezterm-default");
    expect(transition.completed).toBe(false);
  });

  test("applies alternatives in the required seven-screen order", () => {
    const transition = updateWezTermSelection(createWezTermSelectionState(defaults), "2\r3\r1\r3\r2\r3\r3\r");

    expect(transition.state.config).toEqual({
      shell: "wezterm-default",
      color_scheme: "tokyo-night",
      font_size: 11,
      window_background_opacity: 0.88,
      maximize_on_startup: true,
      exit_behavior: "close-on-clean-exit",
      scrollback_lines: 1000000,
    });
    expect(transition.state.stepIndex).toBe(7);
  });

  test("advances through all seven screens and generates only after final confirmation", () => {
    const screens = updateWezTermSelection(createWezTermSelectionState(defaults), "\r\r\r\r\r\r\r");
    const confirmed = updateWezTermSelection(screens.state, "\r");

    expect(screens.state.stepIndex).toBe(7);
    expect(screens.completed).toBe(false);
    expect(confirmed.completed).toBe(true);
    expect(confirmed.cancelled).toBe(false);
  });

  test("retains and decodes an ANSI arrow sequence split across input chunks", () => {
    const first = updateWezTermSelection(createWezTermSelectionState(defaults), "\u001b");
    const second = updateWezTermSelection(first.state, "[B");

    expect(first.state.pendingInput).toBe("\u001b");
    expect(first.state.selectedIndex).toBe(0);
    expect(second.state.pendingInput).toBe("");
    expect(second.state.selectedIndex).toBe(1);
  });

  test("decodes SS3 arrow sequences", () => {
    const transition = updateWezTermSelection(createWezTermSelectionState(defaults), "\u001bOB");

    expect(transition.state.selectedIndex).toBe(1);
  });

  test("decodes Windows extended arrow sequences", () => {
    const transition = updateWezTermSelection(createWezTermSelectionState(defaults), "\u00e0P");

    expect(transition.state.selectedIndex).toBe(1);
  });

  test("supports final Cancel and Ctrl+C cancellation", () => {
    const cancelledAtConfirmation = updateWezTermSelection(advanceToConfirmation(), "\u001b[B\r");
    const interrupted = updateWezTermSelection(createWezTermSelectionState(defaults), "\u0003");

    expect(cancelledAtConfirmation.completed).toBe(false);
    expect(cancelledAtConfirmation.cancelled).toBe(true);
    expect(interrupted.cancelled).toBe(true);
  });
});

describe("WezTerm wizard rendering", () => {
  test("renders the step, focused choice, repository default, current selection, and keyboard help", () => {
    const output = renderWezTermSelection(createWezTermSelectionState(defaults));

    expect(output).toContain("步骤 1/7：Shell");
    expect(output).toContain("> 1. Platform native（仓库默认）");
    expect(output).toContain("当前选择：1");
    expect(output).toContain("↑/↓ 移动，数字选择，Enter 下一步，Ctrl+C 取消");
    expect(output).not.toContain("\u001b");
  });

  test("renders a complete final summary and Generate/Cancel help", () => {
    const output = renderWezTermSelection(advanceToConfirmation());

    expect(output).toContain("配置摘要");
    expect(output).toContain("Shell: Platform native");
    expect(output).toContain("Color theme: Catppuccin Mocha");
    expect(output).toContain("Font size: 12");
    expect(output).toContain("Opacity: 0.94");
    expect(output).toContain("Startup window: Default size");
    expect(output).toContain("Exit behavior: Hold");
    expect(output).toContain("Scrollback: 100,000");
    expect(output).toContain("> 1. Generate");
    expect(output).toContain("  2. Cancel");
    expect(output).toContain("↑/↓ 移动，数字选择，Enter 确认，Ctrl+C 取消");
  });
});

describe("WezTerm wizard rendering colors", () => {
  test("wraps step title, focused choice, default marker, and help in ANSI when colored", () => {
    const palette = createColor(true);
    const output = renderWezTermSelection(createWezTermSelectionState(defaults), palette);
    expect(output).toContain("\u001b[36m"); // cyan step title
    expect(output).toContain("\u001b[32m"); // green focused
    expect(output).toContain("\u001b[33m"); // yellow repo-default marker
    expect(output).toContain("\u001b[90m"); // gray help
  });

  test("wraps confirmation summary and Generate choice in ANSI when colored", () => {
    const palette = createColor(true);
    const output = renderWezTermSelection(advanceToConfirmation(), palette);
    expect(output).toContain("\u001b[36m"); // cyan summary
    expect(output).toContain("\u001b[32m"); // green Generate
  });
});

describe("WezTerm wizard IO lifecycle", () => {
  test.each([
    ["input", new TestInput({ isTTY: false }), new TestOutput()],
    ["output", new TestInput(), new TestOutput({ isTTY: false })],
  ])("rejects non-TTY %s without attaching listeners", async (_name, input, output) => {
    const error = await selectWezTermConfigInteractive(defaults, { input, output }).catch(
      (failure: unknown) => failure,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("当前终端不支持交互式 WezTerm 配置。");
    expect(input.listenerCount()).toBe(0);
    expect(input.rawModeCalls).toEqual([]);
  });

  test("returns the in-memory config and restores raw mode, flow state, and listeners on success", async () => {
    const input = new TestInput();
    const output = new TestOutput();
    const selection = selectWezTermConfigInteractive(defaults, { input, output });

    input.emitData("\r\r\r\r\r\r\r\r");

    const selected = await selection;
    expect(selected).toEqual(defaults);
    selected.font_size = 13;
    expect(defaults.font_size).toBe(12);
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(input.resumeCalls).toBe(1);
    expect(input.pauseCalls).toBe(1);
    expect(input.readableFlowing).toBe(false);
    expect(input.listenerCount()).toBe(0);
  });

  test("cleans up after Ctrl+C cancellation", async () => {
    const input = new TestInput();
    const selection = selectWezTermConfigInteractive(defaults, { input, output: new TestOutput() });

    input.emitData("\u0003");

    const error = await selection.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("已取消 WezTerm 配置。");
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(input.pauseCalls).toBe(1);
    expect(input.readableFlowing).toBe(false);
    expect(input.listenerCount()).toBe(0);
  });

  test("cleans up on input end while preserving pre-existing raw and flowing state", async () => {
    const input = new TestInput({ isRaw: true, readableFlowing: true });
    const selection = selectWezTermConfigInteractive(defaults, { input, output: new TestOutput() });

    input.emitEnd();

    const error = await selection.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WezTerm 配置输入已结束。");
    expect(input.rawModeCalls).toEqual([]);
    expect(input.pauseCalls).toBe(0);
    expect(input.readableFlowing).toBe(true);
    expect(input.listenerCount()).toBe(0);
  });

  test("restores an initially unconsumed input to readableFlowing null", async () => {
    const input = new TestInput({ readableFlowing: null });
    const selection = selectWezTermConfigInteractive(defaults, { input, output: new TestOutput() });

    input.emitEnd();

    const error = await selection.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WezTerm 配置输入已结束。");
    expect(input.readableFlowing).toBeNull();
    expect(input.listenerCount()).toBe(0);
  });

  test("restores null on a real PassThrough stream through the production cleanup", async () => {
    const input = new TtyPassThrough();
    const selection = selectWezTermConfigInteractive(defaults, { input, output: new TestOutput() });

    input.write("\r\r\r\r\r\r\r\r");

    expect(await selection).toEqual(defaults);
    expect(input.readableFlowing).toBeNull();
  });

  test("cleans up and reports input errors", async () => {
    const input = new TestInput();
    const selection = selectWezTermConfigInteractive(defaults, { input, output: new TestOutput() });

    input.emitError(new Error("device lost"));

    const error = await selection.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WezTerm 配置输入错误：device lost");
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(input.pauseCalls).toBe(1);
    expect(input.listenerCount()).toBe(0);
  });

  test("cleans up and rejects when terminal output fails", async () => {
    const input = new TestInput();

    const error = await selectWezTermConfigInteractive(defaults, {
      input,
      output: new TestOutput({ failAt: 1 }),
    }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WezTerm 配置输出失败：broken output");
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(input.pauseCalls).toBe(1);
    expect(input.listenerCount()).toBe(0);
  });

  test("attempts to restore raw mode when enabling raw mode throws after changing state", async () => {
    const input = new TestInput({ failEnablingRawMode: true });

    const error = await selectWezTermConfigInteractive(defaults, { input, output: new TestOutput() }).catch(
      (failure: unknown) => failure,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WezTerm 配置失败：raw mode unavailable");
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(input.pauseCalls).toBe(1);
    expect(input.listenerCount()).toBe(0);
  });
});

class TtyPassThrough extends PassThrough {
  readonly isTTY = true;
  isRaw = false;

  setRawMode(enabled: boolean): void {
    this.isRaw = enabled;
  }
}
