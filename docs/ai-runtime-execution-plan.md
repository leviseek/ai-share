# AI runtime 收敛与运行治理执行计划

## 当前完成度

当前项目已从单纯的配置生成器收敛到 Codex + OMX 用户级运行配置中枢，完成度约 **85%**。

已验证事实：

- `bun run check` 通过。
- `bun run provider:check` 通过。
- 本地代理 `127.0.0.1:7897` 可达。
- 旧 OpenCode / aiomo / aioc / OMO 概念残留未发现。
- `config/*.yaml` 仍是 provider、model、profile、agent、MCP、runtime env 的单一来源。

主要短板：

- `ai:gen --force` 仍以逐文件原子写为主，尚未升级为 staging + promote。
- `profile:eval` 缺少真实运行记录、复测和人工评分字段。
- provider 检查停留在 `/models`，缺少轻量 canary completion。
- personal overlay 与 memory 隐私分层仍需继续细化。

## 优先级

1. **P0：执行文档固化**：把当前判断、风险、验收命令沉淀在本文件。（已完成）
2. **P1：运行诊断聚合**：新增 `bun run ai:doctor`。（已完成）
3. **P1：`.env` managed block**：保护用户手写内容，只管理 ai-share 声明的非密钥变量。（已完成）
4. **P2：生成事务化**：`ai:gen --force` 使用 staging + promote。
5. **P2：profile evaluation 强化**：记录真实运行证据与人工评分。
6. **P3：provider canary**：验证模型真实可调用和参数兼容。
7. **P3：personal overlay / memory 隐私**：引入本地 overlay 并增强隐私检查。

## 阶段性交付

### 阶段 0：文档固化

- 新增本文件。
- 后续阶段完成后更新状态，避免运行治理结论散落在会话中。

验收：

```sh
bun run format:check
```

### 阶段 1：`ai:doctor`

- 新增 `bun run ai:doctor`。
- 聚合 YAML 一致性、默认配置漂移、Codex/OMX 版本、`.env` 本地代理、provider model、memory privacy。
- 默认输出人类可读摘要。
- `--json` 输出机器可读结果。
- provider/network 类问题默认为 warning；传入 `--strict-provider` 后升级为失败。

验收：

```sh
bun run ai:doctor
bun run ai:doctor -- --json
bun run check
bun run provider:check
```

### 阶段 2：`.env` managed block

- managed block marker：
  - `# BEGIN ai-share managed env`
  - `# END ai-share managed env`
- block 内只写入 `config/env.yaml` 生成的非密钥变量。
- block 外用户内容保留。
- 旧全量生成头自动迁移为 managed block。
- `ai:check` 校验 managed block 与 `config/env.yaml` 等价。

验收：

```sh
bun run ai:gen -- --dry-run
bun run ai:check
bun run check
```

### 阶段 3：生成事务化

- `ai:gen --force` 先写 staging，全部成功后 promote。
- 失败时目标配置不进入半生成状态。
- Windows rename/replace 行为需要测试覆盖。
- 保留现有 dry-run 行为。

验收：

```sh
bun run ai:gen -- --dry-run
bun run ai:gen -- --force
bun run ai:check
bun run check
```

### 阶段 4：profile evaluation 强化

- 增加真实运行记录字段：`repeat`、`stdout_path`、`stderr_path`、`failure_tag`、`actual_elapsed_ms`、`manual_score`、`manual_rework_minutes`。
- 输出 Markdown + JSON 对比报告。
- 成本先沿用当前估算逻辑，后续等待 Codex/OMX 暴露 token usage。

验收：

```sh
bun run profile:eval -- --task-id project_analysis --profiles lite --output .tmp/profile-eval.json
```

### 阶段 5：provider canary

- 在 `/models` 外增加轻量 completion。
- 验证模型名、基础参数和 profile 参数兼容性。
- 默认不并入 `bun run check`，避免网络波动影响本地闭环。

验收：

```sh
bun run provider:check
bun run provider:check -- --canary
bun run ai:doctor -- --strict-provider
```

### 阶段 6：personal overlay 与 memory 隐私

- 引入可选 `config/local/*.yaml`，默认 `.gitignore`。
- 合并顺序：共享 base config -> local overlay。
- 对最终合并结果做 schema 校验。
- memory privacy 先扩展规则与 allowlist，再考虑语义分类。

验收：

```sh
bun run memory:check
bun run ai:check
bun run check
```

## 风险与回滚

- `.env` 迁移必须保留 marker 外内容；如发现异常，回滚相关提交并恢复用户本地 `.env` 备份。
- provider canary 依赖网络和第三方服务稳定性，默认不能阻断日常 `check`。
- 事务化生成涉及跨平台文件替换，Windows 需单独验证。
- 不写入真实 API key、token、cookie 或私人 `.env` 内容。
