# Schema

机器可执行的 YAML schema 由 `src/config/schema-spec.ts` 定义。

- `bun run schema:gen` 从同一份规格生成 `docs/schema/json/*.schema.json`。
- `src/config/validators/schema-shape.ts` 从同一份规格执行运行时 shape 校验。
- 本目录下的 Markdown 文件是解释性文档；不要把必填项、类型、枚举或 pattern 规则只改在 Markdown 里。
