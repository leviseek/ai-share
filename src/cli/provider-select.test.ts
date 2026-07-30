import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import {
  buildProviderChoices,
  createProviderSelectionState,
  renderProviderMenu,
  selectProviderInteractive,
  updateProviderSelection,
  type ProviderSelectionInput,
  type ProviderSelectionOutput,
} from "./provider-select.ts";

const choices = [
  { id: "codexapis", name: "Codex APIs" },
  { id: "packyapi", name: "Packy API" },
  { id: "axasapi", name: "Axas API" },
] as const;

describe("interactive provider selection", () => {
  test("builds choices in configured order and falls back to the provider id", () => {
    expect(
      buildProviderChoices({
        codexapis: { name: "Codex APIs", base_url: "https://example.test/v1", api_key: "${CODEX_KEY}" },
        packyapi: { base_url: "https://example.test/v1", api_key: "${PACKY_KEY}" },
        axasapi: {
          name: " Axas\u001b[31m\nAPI ",
          base_url: "https://example.test/v1",
          api_key: "${AXAS_KEY}",
        },
      }),
    ).toEqual([
      { id: "codexapis", name: "Codex APIs" },
      { id: "packyapi", name: "packyapi" },
      { id: "axasapi", name: "Axas API" },
    ]);
  });

  test("supports wrapped arrow navigation and confirmation", () => {
    let state = createProviderSelectionState(choices, "codexapis");
    state = updateProviderSelection(state, "\u001b[A", choices.length).state;
    expect(state.selectedIndex).toBe(2);
    state = updateProviderSelection(state, "\u001b[B", choices.length).state;
    expect(state.selectedIndex).toBe(0);

    const transition = updateProviderSelection(state, "\u001b[B\r", choices.length);
    expect(transition.confirmed).toBe(true);
    expect(transition.state.selectedIndex).toBe(1);
  });

  test("preserves an arrow key sequence split across input chunks", () => {
    let state = createProviderSelectionState(choices, "codexapis");
    state = updateProviderSelection(state, "\u001b[", choices.length).state;
    expect(state.selectedIndex).toBe(0);
    state = updateProviderSelection(state, "B", choices.length).state;
    expect(state.selectedIndex).toBe(1);
  });

  test("supports numeric indexes and refuses an invalid index", () => {
    const initial = createProviderSelectionState(choices, "codexapis");
    const selected = updateProviderSelection(initial, "3\r", choices.length);
    expect(selected.confirmed).toBe(true);
    expect(selected.state.selectedIndex).toBe(2);

    const invalid = updateProviderSelection(initial, "9\r", choices.length);
    expect(invalid.confirmed).toBe(false);
    expect(invalid.invalid).toBe(true);
    expect(invalid.state.selectedIndex).toBe(0);
  });

  test("renders the selected provider and usage hint", () => {
    const output = renderProviderMenu(choices, createProviderSelectionState(choices, "packyapi"));
    expect(output).toContain("数字索引或 ↑/↓");
    expect(output).toContain("> 2. Packy API (packyapi)");
  });

  test("clears the menu and restores terminal input after confirmation", async () => {
    const inputStream = new PassThrough();
    const outputStream = new PassThrough();
    const originalResume = inputStream.resume.bind(inputStream);
    const originalPause = inputStream.pause.bind(inputStream);
    const rawModes: boolean[] = [];
    let rawMode = false;
    let pauseCalls = 0;
    const output: string[] = [];
    outputStream.on("data", (chunk: Buffer) => output.push(chunk.toString("utf8")));
    Object.defineProperties(inputStream, {
      isTTY: { value: true },
      isRaw: { get: () => rawMode },
      setRawMode: {
        value: (enabled: boolean) => {
          rawMode = enabled;
          rawModes.push(enabled);
          return inputStream;
        },
      },
      resume: { value: () => originalResume() },
      pause: {
        value: () => {
          pauseCalls += 1;
          return originalPause();
        },
      },
    });
    Object.defineProperty(outputStream, "isTTY", { value: true });

    const selection = selectProviderInteractive(choices, "codexapis", {
      input: inputStream as unknown as ProviderSelectionInput,
      output: outputStream as unknown as ProviderSelectionOutput,
    });
    inputStream.emit("data", Buffer.from("\r"));

    expect(await selection).toBe("codexapis");
    expect(rawModes).toEqual([true, false]);
    expect(pauseCalls).toBe(1);
    expect(inputStream.readableFlowing).toBe(false);
    expect(inputStream.listenerCount("data")).toBe(0);
    expect(inputStream.listenerCount("end")).toBe(0);
    expect(inputStream.listenerCount("error")).toBe(0);
    const rendered = output.join("");
    const clearSequence = `\u001b[${choices.length + 2}A\r\u001b[J`;
    expect(rendered.slice(rendered.lastIndexOf(clearSequence))).toBe(
      `${clearSequence}已选择 Provider：Codex APIs (codexapis)\n`,
    );
  });
});
