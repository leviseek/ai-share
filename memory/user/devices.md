# 多设备配置

## 主力设备

- **OS**: Windows 11（日常开发主力）
- **Shell**: PowerShell 7+

## 辅助环境

- **WSL2**: Linux 开发环境（Ubuntu）
- **macOS**: 备用开发设备

## 路径约定

- Codex 用户配置: `~/.codex/`
- ai-share 仓库: 各设备通过 Git 同步
- ai-share memory: 随 ai-share 仓库内置的 `memory/` 目录同步

## 同步策略

- ai-share 配置源通过 Git 跨设备同步
- 生成的 JSON 配置不提交到仓库，每个设备独立生成
- API Key 等敏感环境变量每个设备独立设置；非密钥代理默认值可由 `config/env.yaml` 生成到 `CODEX_HOME/.env`
