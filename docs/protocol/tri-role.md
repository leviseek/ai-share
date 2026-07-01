# 三角色模型协议规范 (Tri-Role Model Protocol)

**版本:** 1.1.0
**状态:** Stable
**最后更新:** 2026-06-06

## 概述

三角色模型协议定义一个可移植的模型到任务映射层，将 agent、profile 和具体模型 ID 解耦。

```text
Agent -> Role -> Profile -> Model -> Provider
         primary     balanced.primary     gpt-5.5      codexapis
         reasoning   balanced.reasoning   gpt-5.5
         fast        balanced.fast        gpt-5.4-mini
```

当前参考实现是 ai-share 的 Codex 生成器。

## 角色

| 角色        | 用途                               | 典型模型特征           |
| ----------- | ---------------------------------- | ---------------------- |
| `primary`   | 主执行 agent：编码、生成、日常任务 | 均衡、通用、中等上下文 |
| `reasoning` | 深度分析：规划、架构决策、复杂调试 | 大上下文、高推理强度   |
| `fast`      | 轻量任务：搜索、摘要、标题生成     | 快速、廉价、适合并行   |

## Profile 格式

```json
{
  "protocol": "tri-role/v1",
  "profile_id": "balanced",
  "name": "均衡编排",
  "roles": {
    "primary": { "model": "gpt-5.5" },
    "reasoning": { "model": "gpt-5.5" },
    "fast": { "model": "gpt-5.4-mini" }
  },
  "compaction": {
    "threshold": 65000,
    "max_input_tokens": 120000,
    "model_role": "fast"
  }
}
```

## 内置 Profile

| Profile ID | 定位             | Primary        | Reasoning      | Fast         |
| ---------- | ---------------- | -------------- | -------------- | ------------ |
| `lite`     | 轻量日常         | gpt-5.4        | gpt-5.4        | gpt-5.4-mini |
| `economy`  | GPT 低成本       | gpt-5.4-mini   | gpt-5.4        | gpt-5.4-mini |
| `cheap`    | 极低成本         | gpt-5.4-mini   | gpt-5.4        | gpt-5.4-mini |
| `balanced` | 均衡编排（默认） | gpt-5.5        | gpt-5.5        | gpt-5.4-mini |
| `coding`   | 代码实施优先     | gpt-5.5-coding | gpt-5.5-coding | gpt-5.4-mini |
| `research` | 深度研究         | gpt-5.5        | gpt-5.5        | gpt-5.4-mini |
| `writing`  | 写作润色         | gpt-5.5        | gpt-5.5        | gpt-5.4-mini |
| `max`      | 全力模式         | gpt-5.5        | gpt-5.5        | gpt-5.4      |

## Agent 映射

| Agent               | 角色      | 说明                           |
| ------------------- | --------- | ------------------------------ |
| `sisyphus`          | primary   | 主执行 agent                   |
| `hephaestus`        | primary   | 主力构建/实现 agent            |
| `atlas`             | primary   | 通用任务 agent                 |
| `multimodal-looker` | primary   | 多模态视觉 agent               |
| `prometheus`        | reasoning | 规划 agent                     |
| `oracle`            | reasoning | 只读顾问 agent                 |
| `metis`             | reasoning | 策略/分析 agent                |
| `momus`             | fast      | 代码审查/反馈 agent            |
| `sisyphus-junior`   | fast      | 快速执行 agent                 |
| `explorer`          | fast      | 代码库搜索 agent（无编辑权限） |
| `librarian`         | fast      | 外部文档查询 agent             |

## 解析规则

1. Agent 定义引用角色名，例如 `model: primary`。
2. 当前 profile 将角色名解析为模型 ID。
3. `models.yaml` 将模型 ID 解析为 provider 和上游模型名。
4. `provider.yaml` 提供 base URL 和 API key 环境变量名。
5. Codex 生成器把解析结果写入 profile TOML、agent TOML 和 Codex JSON。

## Fallback

Fallback 链定义在 `models.yaml` 的 `fallback` 字段中。链条应保持同一 provider group 内降级，避免角色语义被静默改变。

## 导入验证

必须验证：

- `protocol` 等于 `tri-role/v1`
- `profile_id` 非空，且只能包含字母、数字、下划线和连字符
- 不接受协议未定义的 top-level、`roles.*`、`compaction.*` 扩展字段
- `roles.primary.model`、`roles.reasoning.model`、`roles.fast.model` 均非空
- `name` 必须是单行字符串，模型引用必须是安全的模型 ID/角色名
- `compaction` 必须是对象
- 模型 ID 在本地模型注册表中存在
- 单个 profile 的 `primary` / `reasoning` / `fast` 必须来自同一 `provider_group`，避免 Codex 在一次编排中混用不同模型家族
- `compaction.threshold <= compaction.max_input_tokens`（当二者都存在）

## 导出

ai-share 提供 profile 导入/导出 CLI：

```sh
bun run src/cli/profile-export.ts balanced
bun run src/cli/profile-export.ts --all --output profiles.json
bun run src/cli/profile-import.ts profiles.json --dry-run
bun run src/cli/profile-import.ts profiles.json --force
```
