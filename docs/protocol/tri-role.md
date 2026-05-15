# 三角色模型协议规范 (Tri-Role Model Protocol)

**版本:** 1.0.0
**状态:** 稳定 (Stable)
**最后更新:** 2026-05-15

---

## 1. 概述

三角色模型协议 (Tri-Role Model Protocol) 定义了一个可移植的模型到任务映射层，将 agent 编排器与具体模型 ID 解耦。

### 核心思想

agents 和 categories 不直接引用具体模型 ID（如 `gpt-5.5` 或 `deepseek-v4-pro-think`），而是引用三个抽象角色名：`primary`、`reasoning`、`fast`。运行时通过当前 profile 将角色名解析为具体模型。

```
Agent/Category (引用角色)  →  Profile (角色→模型映射)  →  Provider (模型→API)
     "primary"                        "gpt-5.5"                  codexapis
     "reasoning"                      "deepseek-v4-pro-think"     deepseek
     "fast"                           "gpt-5.4-mini"             codexapis
```

### 设计动机

- **可移植性**: 同一个 agent 定义可以在不同 AI 工具之间共享，只需替换 profile 中的模型映射。
- **可切换性**: 用户在运行时切换 profile（如 `balanced` → `coding`）即可改变所有 agent 的模型选择，无需修改 agent 定义。
- **成本控制**: 通过 profile 统一管理不同场景的模型组合（低成本 profile、推理密集型 profile 等）。
- **跨工具复用**: profile 文件可被 OpenCode、Cursor/Copilot、Claude Code 等工具消费，作为统一的模型选择策略。

---

## 2. 角色定义

协议定义三个固定角色。每个角色有明确的能力期待和模型特征要求。

| 角色        | 用途                                       | 典型模型特征                        | 上下文窗口 | 成本预期          |
| ----------- | ------------------------------------------ | ----------------------------------- | ---------- | ----------------- |
| `primary`   | 主执行 agent：编码、生成、日常任务         | 均衡、通用、中等上下文              | 128K-200K  | 中等              |
| `reasoning` | 深度分析：规划、架构决策、复杂调试         | 大上下文、thinking 启用、高推理强度 | 256K-1M    | 低（按 token 计） |
| `fast`      | 轻量任务：搜索、摘要、compaction、标题生成 | 快速、廉价、小上下文                | 64K-128K   | 极低              |

### 角色能力对照

```
primary:   平衡通用型，适合长时间编码会话
reasoning: 推理优化型，适合需要深度思考和长链推理的任务
fast:      速度/成本优化型，适合大量并行的小型只读任务
```

### 角色使用场景

| 任务类型                 | 推荐角色               | 示例                                      |
| ------------------------ | ---------------------- | ----------------------------------------- |
| 编写/修改代码            | `primary`              | Sisyphus、Hephaestus agent                |
| 架构设计、debug 复杂问题 | `reasoning`            | Oracle、Prometheus、Metis agent           |
| 代码搜索、文件浏览       | `fast`                 | Explorer、Librarian agent                 |
| 会话自动压缩             | 由 compaction 策略决定 | 通常 `fast`，高精度场景可以用 `reasoning` |
| 轻量问答、格式化         | `fast`                 | quick category、sisyphus-junior           |
| 深度研究、长文档分析     | `reasoning`            | deep category、ultrabrain category        |

---

## 3. Profile 格式

一个 profile 定义了三个角色的模型映射、compaction 策略和上下文预算。

### 3.1 JSON Schema

```json
{
  "$schema": "https://ai-share.dev/schemas/tri-role-profile-v1.json",
  "$id": "https://ai-share.dev/protocol/tri-role/profile.schema.json",
  "type": "object",
  "required": ["profile_id", "version", "roles"],
  "properties": {
    "profile_id": {
      "type": "string",
      "description": "唯一标识符，如 balanced、coding、research"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "协议版本，当前 1.0.0"
    },
    "name": {
      "type": "string",
      "description": "人类可读的显示名称"
    },
    "description": {
      "type": "string",
      "description": "此 profile 的适用场景说明"
    },
    "roles": {
      "type": "object",
      "required": ["primary", "reasoning", "fast"],
      "properties": {
        "primary": {
          "type": "object",
          "required": ["model_id"],
          "properties": {
            "model_id": {
              "type": "string",
              "description": "此角色绑定的模型逻辑 ID（如 gpt-5.5）"
            },
            "temperature": {
              "type": "number",
              "minimum": 0,
              "maximum": 2
            },
            "max_output_tokens": {
              "type": "integer",
              "minimum": 1
            }
          }
        },
        "reasoning": {
          "$ref": "#/properties/roles/properties/primary"
        },
        "fast": {
          "$ref": "#/properties/roles/properties/primary"
        }
      }
    },
    "compaction": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": true
        },
        "threshold": {
          "type": "integer",
          "description": "触发压缩的上下文 token 阈值"
        },
        "max_input_tokens": {
          "type": "integer",
          "description": "允许的最大输入 token 数（上下文守卫熔断依据）"
        },
        "model_role": {
          "type": "string",
          "enum": ["primary", "reasoning", "fast"],
          "description": "用于执行 compaction 的角色；默认为 fast"
        }
      }
    },
    "fallback": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": true
        },
        "retry_on_errors": {
          "type": "array",
          "items": { "type": "integer" },
          "description": "触发 fallback 的 HTTP 状态码"
        },
        "max_attempts": {
          "type": "integer",
          "minimum": 0,
          "default": 1
        },
        "cooldown_seconds": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "strategies": {
      "type": "object",
      "properties": {
        "dcp": {
          "type": "object",
          "properties": {
            "context_budget_tokens": { "type": "integer" },
            "share": {
              "type": "object",
              "properties": {
                "plans": { "type": "boolean" },
                "decisions": { "type": "boolean" },
                "verification": { "type": "boolean" },
                "research_notes": { "type": "boolean" }
              }
            }
          }
        },
        "checkpoint": {
          "type": "object",
          "properties": {
            "max_entries": { "type": "integer" },
            "trigger": { "type": "string" }
          }
        },
        "memory": {
          "type": "object",
          "properties": {
            "retention": {
              "type": "string",
              "enum": ["session", "project"]
            },
            "strategy": {
              "type": "string",
              "enum": [
                "compact-summary",
                "summary-first",
                "verified-summary",
                "evidence-summary",
                "prose-summary",
                "detailed-summary"
              ]
            }
          }
        }
      }
    }
  }
}
```

### 3.2 完整 Profile 示例

```json
{
  "profile_id": "balanced",
  "version": "1.0.0",
  "name": "均衡编排",
  "description": "默认日常编码模式。均衡模型质量与成本。",
  "roles": {
    "primary": {
      "model_id": "gpt-5.5",
      "temperature": 0.2,
      "max_output_tokens": 8192
    },
    "reasoning": {
      "model_id": "deepseek-v4-pro-think",
      "temperature": 0.2,
      "max_output_tokens": 8192
    },
    "fast": {
      "model_id": "gpt-5.4-mini",
      "temperature": 0.2,
      "max_output_tokens": 4096
    }
  },
  "compaction": {
    "enabled": true,
    "threshold": 65000,
    "max_input_tokens": 120000,
    "model_role": "fast"
  },
  "fallback": {
    "enabled": true,
    "retry_on_errors": [429, 503, 529],
    "max_attempts": 1,
    "cooldown_seconds": 60
  },
  "strategies": {
    "dcp": {
      "context_budget_tokens": 24000
    },
    "checkpoint": {
      "max_entries": 20
    },
    "memory": {
      "retention": "project",
      "strategy": "summary-first"
    }
  }
}
```

### 3.3 内置 Profile 摘要

| Profile ID | 定位             | Primary           | Reasoning                 | Fast              |
| ---------- | ---------------- | ----------------- | ------------------------- | ----------------- |
| `lite`     | 轻量日常         | gpt-5.4           | deepseek-v4-flash-think   | gpt-5.4-mini      |
| `economy`  | 激进省钱         | deepseek-v4-flash | deepseek-v4-flash-think   | deepseek-v4-flash |
| `cheap`    | 极低成本         | gpt-5.4-mini      | deepseek-v4-flash-think   | gpt-5.4-mini      |
| `balanced` | 均衡编排（默认） | gpt-5.5           | deepseek-v4-pro-think     | gpt-5.4-mini      |
| `coding`   | 代码实施优先     | gpt-5.3-codex     | deepseek-v4-pro-think     | gpt-5.4-mini      |
| `research` | 深度研究         | gpt-5.5           | deepseek-v4-pro-think-max | gpt-5.4-mini      |
| `writing`  | 写作润色         | gpt-5.5           | deepseek-v4-pro-think     | gpt-5.4-mini      |
| `max`      | 全力模式         | gpt-5.5           | deepseek-v4-pro-think-max | gpt-5.4           |

---

## 4. 模型解析规则

### 4.1 基本解析流程

```
1. Agent/Category 定义引用角色名（如 model: "primary"）
2. 运行时获取当前活跃 profile
3. 在 profile.roles.<role>.model_id 中查找模型 ID
4. 在模型注册表中查找 model_id 对应的 provider 和上游模型名
5. 构造完整的 API 请求
```

### 4.2 Compaction 模型选择

compaction 触发的自动压缩使用的模型按以下优先级决定：

```
1. profile.compaction.model_role（推荐：通常为 fast）
2. 若未设置 → 使用 fast 角色
3. 高精度场景（research、writing、max profile）可使用 reasoning 角色
```

### 4.3 Fallback 链

当模型请求失败（HTTP 429/503/529 等）时，按以下顺序降级：

| 原始模型                  | Fallback 链                                       |
| ------------------------- | ------------------------------------------------- |
| gpt-5.5                   | → gpt-5.4 → gpt-5.4-mini                          |
| gpt-5.4                   | → gpt-5.4-mini                                    |
| gpt-5.4-mini              | 无 fallback                                       |
| gpt-5.3-codex             | 无 fallback                                       |
| deepseek-v4-pro-think-max | → deepseek-v4-pro-think → deepseek-v4-flash-think |
| deepseek-v4-pro-think     | → deepseek-v4-flash-think                         |
| deepseek-v4-flash-think   | → deepseek-v4-flash                               |
| deepseek-v4-flash         | 无 fallback                                       |

fallback 由模型注册表中的 `fallback` 字段定义，运行时通过 `runtime_fallback.model_whitelist` 限制只对 `primary`、`reasoning`、`fast` 三个角色的模型生效。

### 4.4 默认 Profile

若未指定 profile，使用全局配置中的 `default_profile`（当前为 `balanced`）。

### 4.5 并发限制

运行时背景任务并发受以下配置约束：

| 维度        | 限制                              | 说明                       |
| ----------- | --------------------------------- | -------------------------- |
| 按 Provider | gpt: 3, deepseek: 1               | 同一 provider 最大并行请求 |
| 按角色      | primary: 2, reasoning: 1, fast: 6 | 同一角色最大并行 agent 数  |

---

## 5. Agent → 角色映射

### 5.1 标准 Agent 映射

以下为 OMO (oh-my-openagent) 内置 agents 的默认角色分配：

| Agent               | 角色      | 说明                           |
| ------------------- | --------- | ------------------------------ |
| `sisyphus`          | primary   | 主编排 agent                   |
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

### 5.2 标准 Category 映射

| Category             | 角色      | 说明                 |
| -------------------- | --------- | -------------------- |
| `ultrabrain`         | reasoning | 最高推理力 category  |
| `deep`               | reasoning | 深度分析 category    |
| `quick`              | fast      | 快速轻量 category    |
| `unspecified-low`    | fast      | 低强度通用 category  |
| `unspecified-high`   | primary   | 高强度通用 category  |
| `writing`            | primary   | 写作/润色 category   |
| `visual-engineering` | primary   | 前端/可视化 category |
| `artistry`           | primary   | 创意/设计 category   |

### 5.3 原生 Agent 映射

不使用 OMO 时，OpenCode 原生 agents 的角色分配：

| Agent        | 角色      | 说明           |
| ------------ | --------- | -------------- |
| `build`      | primary   | 主编码 agent   |
| `plan`       | reasoning | 只读规划 agent |
| `explore`    | fast      | 代码搜索 agent |
| `general`    | primary   | 通用子 agent   |
| `title`      | fast      | 标题生成 agent |
| `summary`    | fast      | 摘要生成 agent |
| `compaction` | fast      | 自动压缩 agent |

---

## 6. 跨工具适配器合约 (Cross-Tool Adapter Contract)

外部 AI 工具实现此协议时需满足以下最低要求。

### 6.1 必须实现

1. **读取 profile JSON**: 解析符合本协议 schema 的 profile 文件。
2. **解析角色映射**: 支持 `roles.primary.model_id`、`roles.reasoning.model_id`、`roles.fast.model_id` 三个字段。
3. **应用 agent→角色映射**: 将工具的 agent/task-type 映射到协议定义的角色名。
4. **处理 compaction 角色**: 读取 `compaction.model_role` 决定压缩使用的模型。

### 6.2 建议实现

1. **模型注册表**: 维护 `model_id` 到实际 API 端点的映射表。
2. **Fallback 支持**: 读取 `fallback` 配置并执行模型降级。
3. **策略 sidecar**: 读取 `strategies.dcp`、`strategies.checkpoint`、`strategies.memory` 配置上下文治理策略。

### 6.3 工具特定适配示例

```
OpenCode (ai-share):
  model_id "gpt-5.5" → provider "codexapis" → model "gpt-5.5"

Cursor/Copilot:
  model_id "gpt-5.5" → model "gpt-5.1" (平台可用等效模型)

Claude Code:
  model_id "gpt-5.5" → model "claude-sonnet-4-20250514" (能力对照映射)

自定义 agent 框架:
  model_id "gpt-5.5" → 内部模型注册表 → API 调用
```

---

## 7. 导出格式

### 7.1 完整导出

一个完整的协议导出包含以下文件：

```text
tri-role-export/
├── protocol-version.txt          # "1.0.0"
├── profiles/
│   ├── lite.json
│   ├── economy.json
│   ├── cheap.json
│   ├── balanced.json
│   ├── coding.json
│   ├── research.json
│   ├── writing.json
│   └── max.json
├── models.json                   # 模型注册表
├── agents.json                   # agent→角色映射
└── global.json                   # 全局默认值（default_profile 等）
```

### 7.2 最小导出

导入方只需要 profile 文件即可工作，其余为可选：

```text
├── balanced.json                 # 单个 profile 文件
└── models.json                   # 模型注册表（含 provider 信息）
```

### 7.3 models.json 字段规范

```json
{
  "version": "1.0.0",
  "models": {
    "gpt-5.5": {
      "provider_group": "gpt",
      "capabilities": ["reasoning", "planning", "long_context"],
      "cost": { "input": 0.01, "output": 0.03 },
      "limits": { "context_window": 200000, "max_output": 8192 },
      "temperature": 0.2,
      "fallback": ["gpt-5.4"]
    }
  }
}
```

| 字段                    | 类型     | 必须 | 说明                                         |
| ----------------------- | -------- | ---- | -------------------------------------------- |
| `provider_group`        | string   | 是   | 模型所属的 provider 分组（如 gpt、deepseek） |
| `capabilities`          | string[] | 是   | 模型能力标签                                 |
| `cost.input`            | number   | 是   | 每百万 input token 成本（美元）              |
| `cost.output`           | number   | 是   | 每百万 output token 成本（美元）             |
| `limits.context_window` | integer  | 是   | 最大上下文窗口                               |
| `limits.max_output`     | integer  | 是   | 单次最大输出 token 数                        |
| `temperature`           | number   | 否   | 建议温度值                                   |
| `fallback`              | string[] | 否   | 故障降级链中的替代模型 ID                    |
| `parameters`            | object   | 否   | 模型特定参数（如 thinking 配置）             |

### 7.4 agents.json 字段规范

```json
{
  "version": "1.0.0",
  "agents": {
    "sisyphus": { "role": "primary", "permission": { "edit": "allow" } },
    "oracle": { "role": "reasoning", "permission": { "edit": "deny" } },
    "explorer": { "role": "fast", "permission": { "edit": "deny" } }
  },
  "categories": {
    "deep": { "role": "reasoning" },
    "quick": { "role": "fast" }
  }
}
```

---

## 8. 导入验证规则

导入方在消费 profile 时需执行以下验证。

### 8.1 必须验证

| 规则                              | 说明                        |
| --------------------------------- | --------------------------- |
| `profile_id` 非空                 | 唯一标识符不能为空          |
| `roles.primary.model_id` 非空     | primary 角色必须有模型 ID   |
| `roles.reasoning.model_id` 非空   | reasoning 角色必须有模型 ID |
| `roles.fast.model_id` 非空        | fast 角色必须有模型 ID      |
| `version` 格式                    | 必须匹配 `\d+\.\d+\.\d+`    |
| `compaction.threshold` > 0        | 若存在，必须为正数          |
| `compaction.max_input_tokens` > 0 | 若存在，必须为正数          |

### 8.2 建议验证

| 规则                         | 说明                                           |
| ---------------------------- | ---------------------------------------------- |
| model_id 在模型注册表中存在  | 导入方应维护模型注册表，检查引用完整性         |
| threshold < max_input_tokens | compaction 阈值应小于上下文守卫熔断值          |
| 策略配置完整性               | 若 `strategies` 存在，检查子字段符合预期枚举值 |

### 8.3 验证错误处理

- **必须验证失败**: 拒绝加载该 profile，回退到 `default_profile`。
- **建议验证失败**: 输出 warning，继续使用该 profile 但标注降级行为。

---

## 9. 边界情况与处理

### 9.1 角色映射到未知模型 ID

当 profile 中的 `model_id` 在目标平台的模型注册表中不存在时：

- **策略**: 目标平台 MUST 实现模型对照映射（model aliasing）。
- **示例**: 如果 profile 引用 `gpt-5.5` 但目标平台只有 `gpt-5.1`，平台应将 `gpt-5.5` 映射到能力最接近的可用模型。
- **降级**: 如果完全无法匹配，该角色降级为 `runtime_fallback` 链中的下一个模型，或 report error 并回退到 `default_profile`。

### 9.2 Profile 缺失某个角色

profile 的 `roles` 对象必须包含全部三个角色。若导入的 profile 缺少某个角色：

- **处理**: 拒绝加载，回退到 `default_profile`。
- **原因**: 三角色是协议的硬性约束，缺失任一角色会导致部分 agent 无法分配模型。

### 9.3 Compaction 角色未设置

若 `compaction.model_role` 未在 profile 中设置：

- **默认值**: `fast`
- **例外**: research、writing、max 等高精度 profile 建议显式设为 `reasoning`。

### 9.4 跨 Provider Fallback

fallback 链始终在同一 provider 组内进行。GPT 模型不会 fallback 到 DeepSeek，反之亦然。目标平台应遵循此约束。

### 9.5 Compaction Threshold 设为极大值

economy profile 将 compaction threshold 设为 500M，实际上禁用了自动压缩。导入方应正确处理此类极端值：

- **处理**: 当 threshold ≥ context_window 或 ≥ 1B 时，视为禁用自动压缩。
- **效果**: 不会自动触发压缩，但用户仍可手动 `/compact`。

### 9.6 同一设备多 Profile 共存

设备可以同时存在多个 profile 文件。运行时通过 `default_profile` 或用户显式选择决定活跃 profile。不同 profile 之间完全隔离，不会互相影响。

### 9.7 版本升级兼容性

协议版本遵循语义化版本：

- **补丁版本 (1.0.x)**: 向后兼容，导入方可直接升级。
- **次版本 (1.x.0)**: 新增可选字段，旧导入方忽略新字段仍可工作。
- **主版本 (x.0.0)**: 不保证向后兼容，导入方需实现新版本适配器。

---

## 10. 版本演进

| 版本  | 日期       | 变更                                                                       |
| ----- | ---------- | -------------------------------------------------------------------------- |
| 1.0.0 | 2026-05-15 | 初始版本。定义三角色协议、profile schema、模型解析规则和跨工具适配器合约。 |

---

## 附录 A：能力标签参考

模型注册表中的 `capabilities` 字段使用以下标签：

| 标签           | 含义                         |
| -------------- | ---------------------------- |
| `reasoning`    | 支持推理/思考链              |
| `planning`     | 支持分步规划                 |
| `long_context` | 支持长上下文（≥100K tokens） |
| `coding`       | 优化代码生成                 |
| `fast`         | 低延迟响应                   |
| `cheap`        | 极低成本                     |
| `general`      | 通用任务                     |

## 附录 B：Memory 策略枚举

| 策略               | 说明                   | 使用场景                   |
| ------------------ | ---------------------- | -------------------------- |
| `compact-summary`  | 紧凑摘要，丢弃细节     | lite/cheap/economy profile |
| `summary-first`    | 摘要优先，保留关键决策 | balanced profile           |
| `verified-summary` | 带验证标记的摘要       | OMO 默认策略               |
| `evidence-summary` | 附带证据引用的摘要     | research profile           |
| `prose-summary`    | 叙事性摘要，适合写作   | writing profile            |
| `detailed-summary` | 详细摘要，最大化保留   | max profile                |

## 附录 C：Checkpoint 触发策略

| 触发条件                              | 含义                         |
| ------------------------------------- | ---------------------------- |
| `before-edit-and-before-delegation`   | 每次编辑或委托前创建检查点   |
| `before-edit-and-before-risky-change` | 编辑前和风险变更前创建检查点 |

---

> **维护者**: ai-share 项目
> **参考实现**: `config/profiles.yaml`, `config/models.yaml`, `config/agents.yaml`
> **生成工具**: `src/generate-user-config.ts`（本仓库 Bun 生成器）
