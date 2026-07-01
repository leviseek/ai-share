# AI Desktop 架构愿景

## AI 操作系统层

ai-share 正在从“配置仓库”演进为个人 AI 运行时。核心思路是在用户和 AI 模型之间建立一层专有的操作系统抽象层，将模型无关的能力沉淀到这层中：

- **配置即 API**：YAML 源文件定义模型提供商、默认模型、MCP 和 skills，生成器负责物化为 Codex 的具体配置格式。
- **会话管理层**：Codex instructions 和结构化 memory 构成上下文入口。
- **原生扩展**：Codex native skills 构成运行时能力层，可复用流程沉淀在 Codex 可直接消费的配置中。

这层抽象让底层模型可替换，上层的记忆体系、工具链保持不变。

## Memory Runtime

记忆系统是 AI Desktop 的持久化层，不依赖外部服务，完全基于本地文件结构：

- **memory/** 目录是结构化记忆仓库，加载为 Codex instructions 注入会话上下文。
- 用户画像、工作流偏好、设备信息、工具链等分文件组织，每个文件承担单一知识维度。
- 设计目标是跨项目、跨设备、跨 session 的知识连续性。不依赖聊天记录，不依赖外部数据库。
- 未来方向是从静态 Markdown 文件逐步演化为带有缓存和索引的轻量记忆运行时，支持按需检索和增量更新。

## Context Compiler

上下文管理是 AI Desktop 的关键基础设施。目标是在有限上下文窗口中，让 AI 始终拥有完成当前任务所需的最相关信息：

- **静态注入层**：memory/ 文件、AI_GUIDELINES.md、GIT_COMMIT_GUIDELINES.md 等启动时注入的结构化知识。
- **任务检索层**：`AI_SHARE_TASK` 触发本地关键词检索，将最相关 memory 文件插入到结构化 memory 前。
- **会话治理层**：会话中依赖人工 checkpoint、rescue 和总结控制上下文预算。

Context Compiler 不是单次执行，而是一个持续的上下文治理流程：会话开始前选择最相关的静态和任务记忆，会话中控制上下文预算，会话结束后通过人工确认的记忆蒸馏固化进展。

## 模型系统

模型选择收敛为单套 Codex 默认模型配置：

- `config/global.yaml` 的 `model` 选择当前默认模型。
- `config/models.yaml` 维护模型元数据、成本、上下文窗口和 fallback 链。
- `config/provider.yaml` 维护 provider 和 API key 环境变量引用。
- 生成器只物化一套 `CODEX_HOME/config.toml`，不再生成 profile 或 agent 级配置。

核心价值是保持配置简单、可迁移、可审计；需要切换模型时修改 YAML 源并重新生成。

## 跨设备统一

AI Desktop 不是单机系统。用户的工作场景跨 Windows 主力机、WSL Linux 开发环境、macOS 备用设备：

- ai-share 通过 Git 同步配置源（YAML 文件），每个设备独立生成运行时配置。
- 环境变量管理 API Key 等敏感凭证，不写入仓库；非密钥代理默认值可通过 config/env.yaml 生成到 CODEX_HOME/.env，每个设备可按需覆盖。
- ~/ai-workspace 作为统一的 AI 工作区目录约定，与 ~/.codex/ 构成跨设备路径标准。
- 记忆文件作为唯一的知识源，所有设备共享同一套 memory/ 目录结构，确保跨设备知识连续性。

目标是让用户在任何设备上启动 codex，都能获得一致的 AI 协作体验。

## 架构决策记录

- **本地优先，文件即存储**：所有配置、记忆、策略都是本地文件，不依赖云服务、数据库或外部 API。Git 作为同步层，不引入额外的中间件。
- **生成式配置**：YAML -> TOML/JSON 的单向生成路线，YAML 是权威源，手改生成文件不会被持久化。
- **轻量粘合层**：ai-share 不做厚运行时。生成器产生配置，启动器包装环境，剩余的事交给 Codex。ai-share 只解决配置同步、记忆注入、skills 安装这三个核心问题。
- **渐进演进**：从配置仓库到个人 AI 运行时的演进是增量的，每一步都保持迁移边界清晰。
