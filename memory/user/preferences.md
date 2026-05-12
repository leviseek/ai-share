# 工具与模型偏好

## 模型偏好

- 日常编码：GPT-5 系列（balanced profile）
- 深度推理：DeepSeek 系列（research/max profile）
- 轻量任务：GPT-5.4-mini（cheap/lite profile）
- compaction 模型首选 fast（gpt-5.4-mini）

## 编辑器与终端

- VS Code 作为主力编辑器
- PowerShell 7+ 作为 Windows 主力 shell
- 保持项目原有的格式化/lint 配置，不使用个人偏好覆盖

## 项目管理

- ai-share 作为所有 AI 配置的单一权威来源
- YAML 作为配置源，不手动编辑生成的 JSON
- API Key 只通过环境变量引用，不写入仓库

## 通讯语言

- 默认使用简体中文沟通和文档
- 代码标识符、命令、错误信息、API 名称保持英文
