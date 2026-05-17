#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseYamlObject } from "../yaml.ts";
import type { ModelsYaml } from "../types/yaml.ts";

interface CostRow {
  session: string;
  profile: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface PricingEntry {
  input: number;
  output: number;
}

interface SqliteCostRow {
  session_id: string;
  title: string | null;
  model_name: string | null;
  total_input: number | null;
  total_output: number | null;
}

interface StateSession {
  id?: string;
  profile?: string;
  model?: string;
  totalTokens?: number;
}

interface StateJson {
  sessions?: StateSession[];
}

function defaultDbPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(home, ".config", "opencode", "opencode.db");
}

function defaultStatePath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(home, ".config", "opencode", "omo-agent-monitor-state.json");
}

function loadPricing(): Map<string, PricingEntry> {
  const configDir = resolve(import.meta.dirname, "../../config");
  const modelsYaml = parseYamlObject(readFileSync(resolve(configDir, "models.yaml"), "utf8")) as unknown as ModelsYaml;
  const pricing = new Map<string, PricingEntry>();
  for (const [id, model] of Object.entries(modelsYaml)) {
    const input = model.cost?.input;
    const output = model.cost?.output;
    if (input != null && output != null) {
      pricing.set(id, { input, output });
    }
  }
  return pricing;
}

function readFromSqlite(dbPath: string): CostRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(
        `SELECT
          s.id as session_id,
          s.title,
          MAX(json_extract(m.data, '$.model')) as model_name,
          SUM(COALESCE(json_extract(m.data, '$.tokens.input'), 0)) as total_input,
          SUM(COALESCE(json_extract(m.data, '$.tokens.output'), 0)) as total_output
        FROM session s
        INNER JOIN message m ON s.id = m.session_id
        WHERE json_extract(m.data, '$.role') = 'assistant'
        GROUP BY s.id
        ORDER BY s.time_updated DESC
        LIMIT 50`,
      )
      .all() as SqliteCostRow[];

    return rows.map((r) => ({
      session: (r.session_id ?? "unknown").slice(0, 12),
      profile: "unknown",
      model: r.model_name ?? "unknown",
      inputTokens: Number(r.total_input) || 0,
      outputTokens: Number(r.total_output) || 0,
      cost: 0,
    }));
  } finally {
    db.close();
  }
}

function readFromState(statePath: string): CostRow[] {
  const raw = readFileSync(statePath, "utf8");
  const state = JSON.parse(raw) as StateJson;
  const sessions = state.sessions ?? [];
  return sessions.map((s) => ({
    session: (s.id ?? "unknown").slice(0, 12),
    profile: s.profile ?? "unknown",
    model: s.model ?? "unknown",
    inputTokens: s.totalTokens ?? 0,
    outputTokens: 0,
    cost: 0,
  }));
}

function calculateCosts(rows: CostRow[], pricing: Map<string, PricingEntry>): CostRow[] {
  return rows.map((row) => {
    const price = pricing.get(row.model);
    if (!price) return row;
    const cost = (row.inputTokens / 1_000_000) * price.input + (row.outputTokens / 1_000_000) * price.output;
    return { ...row, cost: Math.round(cost * 10000) / 10000 };
  });
}

function formatTable(rows: CostRow[]): string {
  if (rows.length === 0) return "无 token 数据。";

  const header = "Session       | Profile  | Model              | Input    | Output   | Cost ($)";
  const sep = "--------------|----------|--------------------|----------|----------|---------";
  const body = rows
    .map(
      (r) =>
        `${r.session.padEnd(14)}| ${r.profile.padEnd(8)}| ${r.model.padEnd(18)}| ${String(r.inputTokens).padStart(8)}| ${String(r.outputTokens).padStart(8)}| ${r.cost.toFixed(4)}`,
    )
    .join("\n");

  const totalCost = rows.reduce((sum, r) => sum + r.cost, 0);
  const totalInput = rows.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutput = rows.reduce((sum, r) => sum + r.outputTokens, 0);

  return `${header}\n${sep}\n${body}\n${sep}\n总计：${totalInput} input, ${totalOutput} output, $${totalCost.toFixed(4)}`;
}

interface ParsedArgs {
  htmlMode: boolean;
  output: string | null;
  stateFile: string | null;
}

function parseArgs(args: string[]): ParsedArgs {
  const htmlMode = args.includes("--html");
  const outputIdx = args.indexOf("--output");
  const output = outputIdx >= 0 ? (args[outputIdx + 1] ?? null) : null;
  const stateFileIdx = args.indexOf("--state-file");
  const stateFile = stateFileIdx >= 0 ? (args[stateFileIdx + 1] ?? null) : null;
  return { htmlMode, output, stateFile };
}

function buildConicGradient(totals: Map<string, number>): string {
  const colors = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#d97706"];
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let cumulative = 0;
  const segments = entries.map(([, v], i) => {
    const start = (cumulative / total) * 360;
    cumulative += v;
    const end = (cumulative / total) * 360;
    const segmentColor = colors[i % colors.length] ?? "#000000";
    return `${segmentColor} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function buildPieLegend(totals: Map<string, number>): string {
  const colors = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#d97706"];
  return [...totals.entries()]
    .map(
      ([model, cost], i) =>
        `<div><span style="background:${colors[i % colors.length] ?? "#000000"}"></span> ${model}: $${cost.toFixed(4)}</div>`,
    )
    .join("");
}

function buildBarChart(totals: Map<string, number>): string {
  const max = Math.max(...totals.values(), 0.0001);
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([model, cost]) => {
      const pct = ((cost / max) * 100).toFixed(1);
      return `<div class="bar-row">
      <span class="bar-label">${model}</span>
      <div class="bar" style="width:${pct}%"></div>
      <span class="bar-value">$${cost.toFixed(4)}</span>
    </div>`;
    })
    .join("\n");
}

function buildHtmlReport(rows: CostRow[]): string {
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalInput = rows.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutput = rows.reduce((s, r) => s + r.outputTokens, 0);

  const modelTotals = new Map<string, number>();
  for (const row of rows) {
    modelTotals.set(row.model, (modelTotals.get(row.model) ?? 0) + row.cost);
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 成本仪表板</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #333; }
  h1 { color: #1a1a2e; }
  .cards { display: flex; gap: 1rem; flex-wrap: wrap; margin: 1.5rem 0; }
  .card { flex: 1; min-width: 180px; padding: 1.2rem; border-radius: 8px; background: #f8f9fa; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }
  .card .value { font-size: 1.8rem; font-weight: 700; color: #2563eb; }
  .card .label { font-size: 0.85rem; color: #666; margin-top: 0.3rem; }
  .charts { display: flex; gap: 2rem; flex-wrap: wrap; margin: 2rem 0; }
  .chart-box { flex: 1; min-width: 300px; }
  .chart-box h2 { font-size: 1.1rem; margin-bottom: 1rem; }
  .pie { width: 200px; height: 200px; border-radius: 50%; margin: 0 auto; }
  .pie-legend { margin-top: 1rem; }
  .pie-legend span { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  .bar-chart { display: flex; flex-direction: column; gap: 0.5rem; }
  .bar-row { display: flex; align-items: center; gap: 0.5rem; }
  .bar-label { width: 120px; font-size: 0.8rem; text-align: right; flex-shrink: 0; }
  .bar { height: 24px; border-radius: 4px; background: #2563eb; transition: width 0.3s; min-width: 2px; }
  .bar-value { font-size: 0.8rem; color: #666; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
  th, td { padding: 0.6rem 0.8rem; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }
  th { background: #f8f9fa; font-weight: 600; }
  tr:hover { background: #f8f9fa; }
</style>
</head>
<body>
<h1>AI 成本仪表板</h1>

<div class="cards">
  <div class="card"><div class="value">${totalInput.toLocaleString()}</div><div class="label">Input Tokens</div></div>
  <div class="card"><div class="value">${totalOutput.toLocaleString()}</div><div class="label">Output Tokens</div></div>
  <div class="card"><div class="value">$${totalCost.toFixed(4)}</div><div class="label">总成本</div></div>
</div>

<div class="charts">
  <div class="chart-box">
    <h2>按模型成本分布</h2>
    <div class="pie" style="background: ${buildConicGradient(modelTotals)}"></div>
    <div class="pie-legend">${buildPieLegend(modelTotals)}</div>
  </div>
  <div class="chart-box">
    <h2>成本排行</h2>
    <div class="bar-chart">${buildBarChart(modelTotals)}</div>
  </div>
</div>

<table>
<thead><tr><th>Session</th><th>Profile</th><th>Model</th><th>Input</th><th>Output</th><th>Cost</th></tr></thead>
<tbody>${rows
    .map(
      (r) =>
        `<tr><td>${r.session}</td><td>${r.profile}</td><td>${r.model}</td><td>${r.inputTokens.toLocaleString()}</td><td>${r.outputTokens.toLocaleString()}</td><td>$${r.cost.toFixed(4)}</td></tr>`,
    )
    .join("\n")}</tbody>
</table>

</body></html>`;
}

function main(args: string[]): number {
  const parsed = parseArgs(args);

  const pricing = loadPricing();
  let rows: CostRow[];

  if (parsed.stateFile !== null) {
    if (!existsSync(parsed.stateFile)) {
      console.log(`未找到 state 文件：${parsed.stateFile}`);
      console.log("请确认路径或先运行 ai:gen 生成测试 fixture。");
      return 1;
    }
    rows = readFromState(parsed.stateFile);
  } else {
    const dbPath = defaultDbPath();
    if (existsSync(dbPath)) {
      rows = readFromSqlite(dbPath);
    } else {
      console.log(`未找到 OpenCode 数据库：${dbPath}`);
      const stateJsonPath = defaultStatePath();
      if (existsSync(stateJsonPath)) {
        rows = readFromState(stateJsonPath);
      } else {
        console.log("未找到任何 token 数据源。请先运行 OpenCode 会话。");
        return 0;
      }
    }
  }

  rows = calculateCosts(rows, pricing);

  if (parsed.htmlMode) {
    const html = buildHtmlReport(rows);
    const outPath = parsed.output ?? join(process.cwd(), "costs-report.html");
    writeFileSync(outPath, html, "utf8");
    console.log(`HTML 报告已生成：${outPath}`);
    return 0;
  }

  console.log(formatTable(rows));
  return 0;
}

const exitCode = main(process.argv.slice(2));
process.exit(exitCode);
