# AI Desktop 架构愿景

## AI 操作系统层

ai-share 正在从"配置仓库"演进为个人 AI 运行时。核心思路是在用户和 AI 模型之间建立一层专有的操作系统抽象层，将模型无关的能力沉淀到这层中：

- **配置即 API**：YAML 源文件定义模型路由、profile 切换、插件加载策略，生成器负责物化为各工具的具体配置格式。
- **会话管理层**：上下文守卫、DCP 压缩、checkpoint 策略统一由这层接管，各 profile 可独立调整预算和熔断阈值。
- **插件化扩展**：OpenCode 插件 + OMO agents/categories 构成运行时能力层，通知、监控、代理注入都是这层的系统服务。

这层抽象让底层模型可替换，上层的编排逻辑、记忆体系、工具链保持不变。

## Memory Runtime

记忆系统是 AI Desktop 的持久化层，不依赖外部服务，完全基于本地文件结构：

- **memory/** 目录是结构化记忆仓库，加载为 OpenCode 启动指令注入会话上下文。
- 用户画像、工作流偏好、设备信息、工具链等分文件组织，每个文件承担单一知识维度。
- 设计目标是跨项目、跨设备、跨 session 的知识连续性。不依赖聊天记录，不依赖外部数据库。
- 未来方向是从静态 Markdown 文件逐步演化为带有缓存和索引的轻量记忆运行时，支持按需检索和增量更新。

## Context Compiler

上下文管理是 AI Desktop 的关键基础设施。目标是在有限上下文窗口中，让 AI 始终拥有完成当前任务所需的最相关信息：

- **静态注入层**：memory/ 文件、AI_GUIDELINES.md、GIT_COMMIT_GUIDELINES.md 等启动时注入的结构化知识。
- **动态压缩层**：OpenCode DCP 压缩 + checkpoint 策略，按 profile 调节预算。长 session 通过 rescue 生成摘要，不在原始上下文中堆积。
- **策略化调度**：每个 profile 独立配置 context_budget_tokens、max_input_tokens、compaction 阈值，在"上下文深度"和"响应速度"之间做 tradeoff。

Context Compiler 不是单次执行，而是一个持续的上下文治理流程：会话开始前做风险评估，会话中做自动压缩，会话结束后可通过 rescue 固化进展。

## Profile 系统

Profile 是 AI Desktop 的模式选择器，决定了当前会话的模型组合、上下文预算和编排策略：

- 每个 profile 定义 3 个模型角色（primary、reasoning、fast），分别对应主要 agent、深度推理、轻量任务。
- 模型的组合方式定义了 AI 的"工作模式"：coding profile 偏向代码生成模型，research profile 偏向推理模型，writing profile 偏向 prose 模型。
- 上下文预算、compaction 策略随 profile 切换，max 级别允许更大的上下文窗口，lite 级别在 Token 成本和能力之间做取舍。
- 策略 sidecar（strategy.json）携带 DCP、checkpoint、memory 配置，随 profile 切换同步生效。

Profile 系统的核心价值是"按需切换 AI 工作方式"，而不是固定一套配置适用于所有场景。

## 跨设备统一

AI Desktop 不是单机系统。用户的工作场景跨 Windows 主力机、WSL Linux 开发环境、macOS 备用设备：

- ai-share 通过 Git 同步配置源（YAML 文件），每个设备独立生成运行时配置。
- 环境变量管理 API Key 和代理设置，不写入仓库，每个设备独立配置。
- ~/ai-workspace 作为统一的 AI 工作区目录约定，与 ~/.config/opencode/ 构成跨设备路径标准。
- 记忆文件作为唯一的知识源，所有设备共享同一套 memory/ 目录结构，确保跨设备知识连续性。

目标是让用户在任何设备上启动 aiomo/aioc，都能获得一致的 AI 协作体验。

## 架构决策记录

- **本地优先，文件即存储**：所有配置、记忆、策略都是本地文件，不依赖云服务、数据库或外部 API。Git 作为同步层，不引入额外的中间件。
- **生成式配置**：YAML -> JSON 的单向生成路线，YAML 是权威源，手改生成的 JSON 不会被持久化。
- **轻量粘合层**：ai-share 不做厚运行时。生成器产生配置，启动器包装环境，剩余的事交给 OpenCode 和 OMO 完成。ai-share 只解决配置同步、上下文守卫、记忆注入这三个核心问题。
- **渐进演进**：从配置仓库到个人 AI 运行时的演进是增量的，每一步都保持向后兼容。新概念（如 Memory Runtime）先做最小可行版本，验证后再扩展。
