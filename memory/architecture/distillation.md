# 记忆蒸馏流程

## 概念

"蒸馏"指将有价值的对话内容提取为结构化记忆，写入 `ai-memory` 仓库，使其在后续会话中自动注入到 AI 上下文。核心规则：**AI 提案，人工确认**。

当前支持三种操作类型：

| 操作 | 用途 | 说明 |
|------|------|------|
| `add` | 新增或追加 | 新 key 时创建；已有 list 时追加项；已有 scalar 时同 update |
| `update` | 修改已有 | 替换目标 key 的值（scalar、list、object 均可） |
| `delete` | 删除已有 | 移除目标 key 及其所有子节点 |

角色分工：
| 角色 | 职责 |
|------|------|
| AI | 会话结束时总结关键信息，生成结构化记忆提案 |
| 用户 | 审查提案，确认/修改/拒绝，确认后由 AI 写入 |
| ai-share generator | 消费 ai-memory YAML 文件，编译为自然语言指令注入 session |

## 数据流

```
重要对话/任务完成
     ↓
AI 总结关键信息（编码偏好/工作流/架构决策/工具变化）
     ↓
AI 生成记忆提案（Markdown 格式，含操作类型+内容+理由+来源）
     ↓
用户审查 → 可选：修改内容 / 切换操作类型（add/update/delete）/ 拒绝部分条目
     ↓
用户确认后，AI 执行写入（parse→modify→serialize）到 D:\ai-memory\stable\ 或对应目录
     ↓
下次运行 `bun run ai:gen` → buildInstructionsPaths() 加载
     ↓
后续 session 启动时自动注入
```

## 写入目的地

| 文件 | 内容 | 举例 |
|------|------|------|
| `stable/user.yaml` | 用户画像、编码风格、偏好 | 新增工具链、沟通偏好 |
| `stable/workflows.yaml` | 开发流程、验证习惯、调试策略 | 测试流程变化 |
| `stable/devices.yaml` | 多设备配置、路径约定 | 新增设备、路径变更 |
| `profiles/coding.yaml` | 项目级编码规范 | 代码风格约束 |
| `policies/memory-policy.yaml` | 记忆治理策略 | 蒸馏规则变更 |

## 触发时机

- 重要的架构决策讨论后
- 新增/变更工具链后
- 编码风格或工作流偏好明确表达后
- 纠正了 AI 对项目上下文的误解后
- AI 主动提议"这条值得记入 memory"，你确认时

## 提案格式

AI 会按以下格式输出记忆提案供你审查：

```markdown
## 记忆提案

会话摘要：ai-share 升级讨论
日期：2026-05-13
会话 ID：ses_xxx

### 提案 1：新增 — stable/user.yaml → coding_style.principles

操作：新增
内容：
```yaml
理解根因，再做最小正确改动
```

理由：用户确认的编码原则
来源：对话中用户明确说明

- [ ] 确认写入  [ ] 拒绝

### 提案 2：修改 — stable/user.yaml → communication.language

操作：修改
内容：
```yaml
zh-CN（简体中文）
```

理由：用户指定默认沟通语言
来源：对话中用户明确说明

- [ ] 确认写入  [ ] 拒绝

### 提案 3：删除 — stable/user.yaml → deprecated_section

操作：删除

理由：已废弃的配置段
来源：对话中用户要求清理

- [ ] 确认写入  [ ] 拒绝
```

## 审查操作

| 操作 | 说明 |
|------|------|
| 确认写入 | 告诉 AI "确认"，AI 执行写入并创建 `.bak` 备份 |
| 修改内容 | 直接编辑 YAML 内容块，AI 按修改后版本写入 |
| 切换操作 | 告诉 AI "改成 update" 或 "改成 delete"，AI 更新 operation 字段 |
| 拒绝 | 告诉 AI "拒绝某条"，该条跳过 |
| 部分采纳 | 选择性确认，其余拒绝 |

写入前会自动备份原文件（`.bak`），可随时回滚。

## 现有工具

| 文件 | 用途 |
|------|------|
| `src/loaders/memory-proposal.ts` | 提案类型定义、模板生成、格式化输出、写入执行（parse→modify→serialize）、系统指令 |
| `src/loaders/memory-compiler.ts` | YAML 解析（`parseMemYaml`）、序列化（`serializeMemYaml`）、→自然语言编译 |
| `src/loaders/memory-loader.ts` | profile→memory 文件映射、文件存在检查 |
| `src/config/builders/opencode.ts` | 调用 `buildInstructionsPaths()` 加载 memory 文件 |

## 确认写入

AI 写入后，建议提交 `ai-memory` 仓库以同步到其他设备：

```powershell
cd D:\ai-memory
git add -A
git commit -m "记忆: 添加 xxx 记录"
git push
```

## 反模式

- 不要存储 API Key、Token、密码等敏感信息
- 不要把整个对话历史写入 memory — 只提炼关键信息
- 不要存储临时性、一次性决策
- 不需要每轮对话都蒸馏 — 只在产生"值得记住"的信息时进行
- 不要由 AI 自动写入 stable — 必须经过人工确认
