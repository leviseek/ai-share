# config/wezterm.yaml Schema

`wezterm.yaml` 是 `ai:config` 的唯一配置源。命令读取该文件，生成当前用户的 `~/.config/wezterm/wezterm.lua`；不读取 `config/local/wezterm.yaml`，交互向导的临时选择也不会回写此文件。固定对象拒绝未知字段。

| Field                       | Type                         | Required | Default            | Description                                                                                                                                                      |
| --------------------------- | ---------------------------- | -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell`                     | enum                         | yes      | `platform-native`  | `platform-native` 在 Windows 使用 `pwsh.exe -NoLogo`，在 macOS 使用 `/bin/zsh -l`；`wezterm-default` 不设置 `default_prog`                                       |
| `color_scheme`              | enum                         | yes      | `catppuccin-mocha` | 可选 `catppuccin-mocha`、`dracula`、`tokyo-night`、`wezterm-default`；前三者分别生成 `Catppuccin Mocha`、`Dracula`、`Tokyo Night`，默认主题不写入 `color_scheme` |
| `font_size`                 | `11 \| 12 \| 13`             | yes      | `12`               | WezTerm 字体大小                                                                                                                                                 |
| `window_background_opacity` | `0.88 \| 0.94 \| 1`          | yes      | `0.94`             | 窗口背景透明度                                                                                                                                                   |
| `maximize_on_startup`       | boolean                      | yes      | `false`            | `true` 时注册 `gui-startup` 回调并最大化启动窗口                                                                                                                 |
| `scrollback_lines`          | `10000 \| 100000 \| 1000000` | yes      | `100000`           | 滚动回溯行数                                                                                                                                                     |

示例：

```yaml
shell: platform-native
color_scheme: catppuccin-mocha
font_size: 12
window_background_opacity: 0.94
maximize_on_startup: false
scrollback_lines: 100000
```

`ai:config` 仅支持 Windows 和 macOS。stdin 和 stdout 均为 TTY 时默认启动六步交互向导；非 TTY 或使用 `--non-interactive` 时使用仓库值。`--dry-run` 只展示计划，`--force` 只显式接管未受管的目标普通文件。目标路径、所有权和安全边界见 [`README.md`](../../README.md) 的 WezTerm 配置说明。
