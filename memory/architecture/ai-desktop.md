# AI Desktop 架构

## 边界

`ai-share` 是本地优先的 Codex 配置与上下文生成层，不是独立 AI runtime、数据库或启动器。它只管理三类结果：Codex config、instructions、native skills。

```text
YAML + ignored local overlay
→ Bun.YAML.parse
→ strict validation
→ selected model/provider
→ GenerationPlan
→ transactional install/prune/clean
```

- `config/*.yaml` 是权威源；`config/local/*.yaml` 提供本机非密钥覆盖。
- 真实凭据只由环境变量提供，生成器仅写 env-var 名引用。
- 生成器不创建工作区、不安装 Codex、不维护 profile/agent 编排，也不生成 runtime manifest。

## Context Layer

默认 `AGENTS.md` 固定加载 execution contract、memory lifecycle 和三个 stable 文件。任务描述通过 `--task` 或 `AI_SHARE_TASK` 触发确定性 token-overlap 检索，最多插入三个去重路径。

检索只覆盖 architecture、stack、非固定 policies 和人工确认的 distilled 内容；template、inferred 与未确认 distilled 不进入会话。上下文选择在每次 `ai:gen` 时编译，不存在后台 compiler 或自动写回链路。

## Memory Governance

- `memory/stable/` 保存用户明确确认的长期事实。
- `memory/distilled/` 保存人工确认的可复用故障或架构模式。
- `memory-curator` 与 `failure-distiller` 只生成普通 patch；写入前继续人工审查。
- 不保存完整聊天记录、真实 secret 或未脱敏生产信息。

## Model And Provider

- `config/global.yaml` 选择唯一默认 model 和 provider。
- `config/models.yaml` 只保存上游 `model_name` 与可选 reasoning effort。
- `config/provider.yaml` 只保存显示名、HTTPS endpoint 和 API Key 环境变量引用。
- 交互式 `ai:gen` 未传 `--provider` 时显示数字索引/方向键菜单；非 TTY 环境不等待输入。
- 生成的 `config.toml` 只包含当前选中的 Provider，不负责成本计算、自动选模或 fallback。

## Cross-device

配置源与已确认 memory 通过 Git 同步，每台设备独立运行生成器并在系统环境中设置凭据。本机代理放在 ignored overlay；`CODEX_HOME` 之外的工作区和用户文件不属于生成器所有权。

## Design Decisions

- 本地文件即存储，Git 只同步源文件。
- 严格校验先于任何副作用。
- generated header 与 skill marker 建立显式所有权。
- staged write/delete 提供事务提交和失败回滚。
- clean 只处理明确受管目标，不递归删除整个 Codex home。
