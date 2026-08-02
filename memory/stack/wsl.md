# WSL2 使用知识

## Filesystem

- 性能敏感的依赖安装、Git 和构建优先放在 WSL Linux 文件系统，避免在 `/mnt/c/` 或 `/mnt/d/` 上进行重型 IO。
- Windows 与 WSL 的权限、大小写和换行语义不同；避免两侧同时修改同一工作树。
- `node_modules` 应在实际执行构建的环境中安装，不跨 Windows/WSL 复用。

## Environment

- WSL 有独立的 HOME、shell profile、PATH 和环境变量；Windows 侧 API Key 不会自动继承。
- OpenCode 与 ai-share 在 WSL 中运行时，需要独立设置 `HOME`/`OPENCODE_CONFIG_DIR` 和 Provider API Key。
- `aioc` 由当前设备独立生成到 `~/.local/bin`；应确保该目录位于 PATH。
- 本机代理地址取决于 WSL 网络模式与代理监听范围，使用前应实际验证。

## Tooling And Safety

- Bun/Node/TypeScript 在 WSL 内使用 Linux 版本。
- PowerShell 脚本需要 `pwsh`；跨系统路径和 quoting 需分别处理。
- 不从一侧 shell 枚举路径后交给另一侧 shell 批量删除或移动。
- 不把本机代理、凭据或私有路径提交到 shared config；非密钥差异使用 ignored local overlay。
