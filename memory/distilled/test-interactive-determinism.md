---
source: session-distilled
confirmed_by_user: true
created_at: 2026-08-07
review_after: 2026-11-07
scope: global
confidence: high
---

# 测试/门禁路径的交互函数必须显式非交互

## Root Cause

- `buildGenerationPreview`(src/generation-preview.ts)的 optional 交互判定 `shouldPromptOptional` 原为 opt-out 语义：`interactiveOptionalSelection !== false`，未传参即「跟随进程 TTY 状态」。交互开关被隐式交给进程环境，而非调用方显式决定。
- `bun test` 运行 `generation-preview.test.ts` / `explain-report.test.ts` 时，部分测试调用 `buildGenerationPreview` 只传 `interactiveProviderSelection: false`，未禁用 optional 交互。本机真实终端 stdin/stdout 为 TTY → `shouldPromptOptional` 返回 true → 弹出 `selectInstallInteractive` 安装菜单等待输入，`bun run check` 门禁卡住。
- GitHub Actions 中 stdin 非 TTY → `shouldPromptOptional` 恒 false → CI 门禁「偶然通过」，缺陷只在真实终端暴露。门禁通过 ≠ 代码正确：当门禁行为依赖环境时，通过与否只是环境的偶然结果。
- 生产入口 `ai-explain.ts` 早已有安全模式（`interactiveOptionalSelection: false`），测试未对齐。

## Bad Fixes

- 只修当前测试调用点（不防再犯，任何未来新增 `buildGenerationPreview` 调用点都会重蹈覆辙）。
- 让 `selectInstallInteractive` / `selectProviderInteractive` 在非 TTY 时 throw（只保护「误进交互」，不解决 TTY 下忘记禁用）。
- CI 加伪 TTY 暴露问题（治标，让门禁更不可预测）。

## Correct Fix

- 反转默认值：交互改为 opt-in。`shouldPromptOptional` 仅当显式传 `interactiveOptionalSelection: true` 时返回 true；`ai:gen` CLI 入口（`runGeneration`）在 TTY 且非 dry-run 时显式传 true 保留 UX。库函数 fail-safe，忘记传参的代价是「少一次交互」而非「卡住门禁」。
- 测试调用交互共享函数必须满足：注入 `providerSelector` / `optionalSelector`，或显式传 `interactiveProviderSelection: false` 且 `interactiveOptionalSelection: false`。禁止依赖「当前进程不是 TTY」的环境假设。
- 门禁脚本/CI 与本地执行同一非交互语义；门禁结果与环境无关。

## Detection

- 在真实 TTY 终端跑 `bun test` / `bun run check`，观察是否弹安装/Provider 菜单、是否卡住等待输入。
- `rg "buildGenerationPreview\(" src --glob "*.test.ts"`，检查每个调用点是否含 `interactiveOptionalSelection: false` 或注入 `optionalSelector`。
- 守护测试：模拟 TTY 下未显式启用 optional 交互时，断言不进入交互选择器（`src/generation-preview.test.ts`）。

## Prevention

- 交互默认 opt-in，未传参 = 非交互（已在 `shouldPromptOptional` 反转）。
- 新增调用点对照 src/AGENTS.md CONVENTIONS 的交互测试纪律检查。
- 门禁/CI 与本地共享同一条非交互检查命令。

## Evidence

- 事故：本机 PowerShell 跑 `bun run check` 卡在安装菜单；GitHub Actions CI 因 stdin 非 TTY 未暴露。
- 修复：`shouldPromptOptional` 反转默认值；`runGeneration` 透传 `interactiveOptionalSelection`；测试调用点显式传 `interactiveOptionalSelection: false`；新增模拟 TTY 守护测试。
- 相关文件：`src/generation-preview.ts`、`src/generate-user-config.ts`、`src/generation-preview.test.ts`、`src/cli/explain-report.test.ts`。
