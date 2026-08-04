import { describe, expect, test } from "bun:test";
import { createColor } from "./color.ts";
import { createInstallSelectionState, renderInstallMenu, type InstallChoice } from "./install-select.ts";

describe("InstallChoice kind", () => {
  test("carries an optional kind for optional components", () => {
    const choices: InstallChoice[] = [
      { id: "tool:superpowers", label: "Superpowers", kind: "tool", required: false, selected: true, status: "已启用" },
    ];
    const state = createInstallSelectionState(choices);
    expect(state.selectedIds.has("tool:superpowers")).toBe(true);
  });
});

describe("InstallChoice rendering", () => {
  const choices: InstallChoice[] = [
    {
      id: "superpowers@git+https://example.test/superpowers.git",
      label: "Superpowers",
      kind: "tool",
      required: false,
      selected: true,
      status: "已启用",
    },
    { id: "ai-sensei", label: "ai-sensei", kind: "agent", required: false, selected: false, status: "未启用" },
  ];

  test("renders plain text by default", () => {
    const state = createInstallSelectionState(choices);
    const output = renderInstallMenu(choices, state);
    expect(output).toContain("请选择安装内容");
    expect(output).toContain("> [x] Superpowers (已启用)");
    expect(output).toContain("  [ ] ai-sensei (未启用)");
    expect(output).toContain("↑/↓ 移动，Space 选择或取消，Enter 确认，Ctrl+C 取消");
    expect(output).not.toContain("\u001b");
  });

  test("wraps title and focused choice in ANSI when a color palette is provided", () => {
    const state = createInstallSelectionState(choices);
    const palette = createColor(true);
    const output = renderInstallMenu(choices, state, "install", palette);
    expect(output).toContain("\u001b[36m"); // cyan title
    expect(output).toContain("\u001b[32m"); // green checked/focused
    expect(output).toContain("\u001b[90m"); // gray unchecked/help
    expect(output).toContain("\u001b[1m\u001b[32m> \u001b[32m[x]\u001b[0m Superpowers"); // focused choice green bold
  });
});
