# Git 提交规范

本文档定义通用 Git 提交信息格式，适用于本仓库及其他项目。

## 基本要求

- 只有用户明确要求时才执行 `git commit`。
- 提交前必须检查 `git status` 和 `git diff`，确认只提交本次任务相关文件。
- 不提交密钥、令牌、本地环境文件、临时产物或无关改动。
- 不使用 `--no-verify`、`--amend`、强制推送等跳过校验或改写历史的操作，除非用户明确要求。

## 提交信息格式

提交信息使用：

```text
option: 中文描述
```

规则：

- `option` 使用英文小写。
- 冒号 `:` 使用英文半角冒号。
- 冒号后保留一个空格。
- 冒号后的描述内容使用中文。
- 描述应简短说明本次改动目的，而不是机械罗列文件名。

## 常用 option

- `feat`: 新增功能
- `fix`: 修复问题
- `docs`: 文档更新
- `refactor`: 重构代码
- `test`: 测试相关
- `chore`: 杂项维护
- `build`: 构建或依赖调整
- `config`: 配置调整
- `style`: 格式或样式调整
- `perf`: 性能优化

## 示例

```text
feat: 增加 OpenCode 配置共享命令
fix: 修复 Windows 下 Bun 脚本启动失败问题
docs: 精简仓库使用说明
config: 补充 DeepSeek 思考模式模型配置
chore: 初始化 Bun 和 TypeScript 项目结构
```

## 不推荐示例

```text
新增: check ai
update: change files
fix：修复bug
docs: update README
```

原因：

- `新增: check ai` 的 option 不是英文。
- `update: change files` 的描述不是中文且过于笼统。
- `fix：修复bug` 使用了中文冒号。
- `docs: update README` 的描述不是中文且偏向文件名罗列。
