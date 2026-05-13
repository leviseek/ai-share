# 多设备配置

## 主力设备

- **OS**: Windows 11（日常开发主力）
- **Shell**: PowerShell 7+

## 辅助环境

- **WSL2**: Linux 开发环境（Ubuntu）
- **macOS**: 备用开发设备

## 路径约定

- 用户级 bin: `~/.local/bin/`（Windows: `%USERPROFILE%\.local\bin\`）
- OpenCode 用户配置: `~/.config/opencode/`
- ai-share 仓库: 各设备通过 Git 同步
- ai-memory: 所有设备统一 `~/ai-memory`（独立仓库）

## 同步策略

- ai-share 配置源通过 Git 跨设备同步
- 生成的 JSON 配置不提交到仓库，每个设备独立生成
- 环境变量（API Key、代理配置）每个设备独立设置
