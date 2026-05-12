# WSL2 使用知识

## 基本环境

- 发行版：Ubuntu（WSL2）
- Shell：bash（默认），zsh 可选
- 包管理器：apt
- 用户主目录：`/home/<user>`，与 Windows 用户目录隔离

## 文件系统

- Windows 驱动器挂载在 `/mnt/c/`、`/mnt/d/` 等路径
- **不要从 `/mnt/c/` 路径运行重型构建**（npm install、git 操作等），跨文件系统性能较差
- Linux 原生文件系统（`/home/<user>/`）IO 性能远优于 `/mnt/c/` 回环
- 推荐在 WSL 内 `~/projects/` 下管理代码仓库，通过 `\\wsl.localhost\Ubuntu\home\<user>\` 从 Windows 访问
- WSL2 中 `node_modules/` 在 `/mnt/c/` 下安装可能触发 `ENOTSUP` 或符号链接错误

## 网络

- WSL2 使用 NAT 网络，IP 与 Windows 主机不同，每次重启可能变化
- 访问 Windows 主机服务用 `localhost`（WSL2 自动转发）
- Windows 访问 WSL2 内服务需用 `localhost` 或 WSL 虚拟机 IP（`wsl hostname -I` 查看）
- 代理配置：Windows 代理客户端（如 Clash）在 `127.0.0.1:<port>`，WSL2 内需通过 `cat /etc/resolv.conf` 获取宿主机 IP 访问
- WSL2 自动继承 Windows 的 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量通常不可靠，推荐在 `~/.bashrc` 中手动设置

## 包管理

- apt 源需手动更新：`sudo apt update && sudo apt upgrade`
- 常用开发包：`build-essential`、`python3`、`python3-pip`、`nodejs`（通过 nvm 安装，不用 apt 版本）
- `libdbus-1-dev`、`pkg-config` 在构建 Tauri 等 Rust 项目时需要
- `wget`、`curl`、`git`、`unzip` 默认已安装或很容易补装

## Shell 配置

- `~/.bashrc` 是主要配置文件，修改后 `source ~/.bashrc` 或重启终端生效
- WSL 启动时不会执行 Windows 侧的 profile 脚本
- `~/.profile` 在 login shell 时执行，`~/.bashrc` 在 interactive non-login shell 时执行
- 建议在 `~/.bashrc` 中配置 PATH 扩展、代理变量和别名

## Windows 互操作

- 从 WSL 调用 Windows 程序：`/mnt/c/Windows/System32/notepad.exe` 或 `notepad.exe`（PATH 已包含 Windows System32）
- 从 Windows 访问 WSL 文件：`\\wsl.localhost\Ubuntu\`
- `wsl.exe` 命令在 PowerShell 中管理 WSL：`wsl --shutdown`、`wsl --list -v`
- WSL2 不支持 systemd 默认，需手动启用（`/etc/wsl.conf` 加 `systemd=true`），重启生效
- 从 WSL 启动 Windows GUI 程序可以，反过来 Windows 不能直接启动 WSL GUI 程序（需通过 `wsl.exe` 调用）

## 常见陷阱

- **文件权限**：从 `/mnt/c/` 复制到 WSL 的文件可能带 `+x` 权限问题，`/mnt/c/` 下文件权限继承 Windows ACL，可能全部显示 `777`
- **Git 换行符**：Windows 和 WSL 的 Git 换行符配置（`core.autocrlf`）可能冲突，推荐 WSL 内设置 `git config --global core.autocrlf input`
- **npm/yarn 权限**：不建议 `sudo npm install -g`，使用 nvm 管理 Node.js 版本
- **Docker**：WSL2 推荐使用 Docker Desktop WSL2 backend，或直接在 WSL2 内安装 Docker Engine
- **`wsl --shutdown`** 会终止所有 WSL 进程包括 Docker，重启后需重新启动 Docker 服务
- **`/mnt/c/` 大小写敏感**：默认不启用，需 `fsutil.exe file setCaseSensitiveInfo` 启用，否则可能引起 TypeScript 编译大小写问题

## 工具链差异

- TypeScript 编译、Bun、Node.js 在 WSL2 下行为与原生 Linux 一致
- PowerShell 脚本在 WSL2 内不可直接运行，需 `pwsh`（安装 PowerShell Core）
- `code .` 命令默认调用 Windows VS Code（WSL Remote），需要安装 `Remote - WSL` 扩展
- OpenCode 在 WSL2 内运行需单独配置 API Key 和环境变量，不共享 Windows 的环境变量
