import { describe, expect, test } from "bun:test";
import { parseYamlObject } from "./yaml.ts";

describe("parseYamlObject", () => {
  test("解析对象、标量、列表和注释", () => {
    expect(
      parseYamlObject(`
name: demo # 行尾注释
enabled: true
count: 3
empty: null
quoted_hash: "a # b"
items:
  - first
  - second
nested:
  value: ok
`),
    ).toEqual({
      name: "demo",
      enabled: true,
      count: 3,
      empty: null,
      quoted_hash: "a # b",
      items: ["first", "second"],
      nested: {
        value: "ok",
      },
    });
  });

  test("解析显式空列表", () => {
    expect(parseYamlObject("items: []\n")).toEqual({ items: [] });
  });

  test("解析多行文本块并保留末尾换行", () => {
    expect(
      parseYamlObject(`
prompt:
  append: |
    第一行
    第二行
`),
    ).toEqual({
      prompt: {
        append: "第一行\n第二行\n",
      },
    });
  });

  test("拒绝顶层或对象数组语法", () => {
    expect(() => parseYamlObject("- item\n")).toThrow("暂不支持顶层或对象数组 YAML 语法：第 1 行");
  });
});
