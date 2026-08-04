import { describe, expect, test } from "bun:test";
import { createInstallSelectionState, type InstallChoice } from "./install-select.ts";

describe("InstallChoice kind", () => {
  test("carries an optional kind for optional components", () => {
    const choices: InstallChoice[] = [
      { id: "tool:superpowers", label: "Superpowers", kind: "tool", required: false, selected: true, status: "已启用" },
    ];
    const state = createInstallSelectionState(choices);
    expect(state.selectedIds.has("tool:superpowers")).toBe(true);
  });
});
