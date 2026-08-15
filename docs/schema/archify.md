# config/archify.yaml Schema

`archify.yaml` 是外部 Archify skill 分发的唯一声明源。`ai:archify` 负责按固定 `ref` 获取内容，并在 Skills CLI 的全局目录 `~/.agents/skills/<skill>/` 写入 ai-share ownership marker；普通 `ai:gen` 不下载网络内容，只检查 ownership 与 revision 是否一致。

```yaml
archify:
  repo: tt-a1i/archify
  skill: archify
  ref: cffdd42eed0ebf013aa070378d94facdd3d56b10
  enabled: true
```

| Field             | Type                                          | Required | Description                                                    |
| ----------------- | --------------------------------------------- | -------- | -------------------------------------------------------------- |
| `archify`         | object                                        | yes      | Archify 管理设置                                               |
| `archify.repo`    | `owner/repository`                            | yes      | 只允许安全的 GitHub repository slug                            |
| `archify.skill`   | lowercase skill id                            | yes      | 目标 skill 目录名                                              |
| `archify.ref`     | 40 位 commit 或安全 tag/ref（不含路径分隔符） | yes      | 可复现的外部 source revision                                   |
| `archify.enabled` | boolean                                       | yes      | 是否保留受管 Archify skill；关闭后下一次 `ai:gen` 删除受管目录 |

`ai:archify` 先用 Git 将 `<repo>` 的固定 `<ref>` 获取到临时目录，再让 `skills add` 从该本地 source 安装，避免默认分支漂移。成功后会在 `~/.agents/skills/<skill>/` 写入 `.ai-share-managed` 和 `.ai-share-archify-ref.json`。如果目标目录没有有效 ownership，安装与生成默认都不会强行接管；备份并确认后可显式使用 `ai:archify -- --force`。
