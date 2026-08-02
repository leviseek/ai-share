# AI Desktop 架构

## 边界

`ai-share` 是本地优先的 OpenCode 配置与上下文生成层，不是独立 AI runtime 或数据库。它管理 OpenCode config、instructions、native skills 和只负责环境注入的最小 `aioc` 启动器。

```text
YAML + ignored local overlay
→ Bun.YAML.parse
→ strict validation
→ selected model/provider + task memory
→ GenerationPlan
→ transactional install/prune/clean
```

- `config/*.yaml` 是权威源；`config/local/*.yaml` 提供本机非密钥覆盖。
- 凭据只由系统环境提供；生成配置只保存 `{env:NAME}` 引用。
- 生成器不创建工作区、不安装 OpenCode、不维护 OMO/profile 编排，也不生成 runtime manifest。

## Context Layer

OpenCode `instructions` 固定加载 execution contract、memory lifecycle 和三个 stable 文件。`--task` 或 `AI_SHARE_TASK` 触发确定性检索，最多插入三个去重路径。

检索只覆盖 architecture、stack、非固定 policies 和人工确认的 distilled 内容；template、inferred 与未确认 distilled 不进入会话。不存在后台 compiler 或自动写回链路。

## Model And Provider

- `global.yaml` 选择默认 model 和 provider。
- `models.yaml` 保存模型别名、上游 `model_name` 和 reasoning effort。
- 当前选中的 Provider 生成到 `opencode.jsonc`，其余 Provider 不物化。
- 模型与 agent 引用统一为 `provider/model`；不负责成本计算、自动选模或 fallback。

## Runtime And Ownership

- `aioc` 读取 managed `.env`，仅补全当前进程缺失的非密钥变量，然后启动原生 `opencode`。
- generated header、skill marker 与 launcher marker建立显式所有权。
- staged write/delete 提供事务提交和失败回滚。
- clean 只处理明确受管目标，不递归删除整个 OpenCode config 目录。

## Cross-device

配置源与已确认 memory 通过 Git 同步；每台设备独立运行生成器、安装 `aioc` 并设置凭据。本机代理放在 ignored overlay，`OPENCODE_CONFIG_DIR` 外的用户配置不属于生成器所有权。
