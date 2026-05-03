import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type DingTalkNotifierConfig = {
  enabled?: boolean;
  webhook_env?: string;
  secret_env?: string;
  keyword_env?: string;
  message_type?: "text" | "markdown";
  events?: string[];
  require_review_before_send?: boolean;
  review_items?: string[];
  min_interval_ms?: number;
  timeout_ms?: number;
};

type DingTalkPayload =
  | { msgtype: "text"; text: { content: string } }
  | { msgtype: "markdown"; markdown: { title: string; text: string } };

type DingTalkResponse = {
  errcode?: number | string;
  errmsg?: string;
};

type Plugin = { id: string; server(): Promise<Record<string, (input: Record<string, unknown>) => Promise<void>>> };

type EventHandlerMap = Record<string, (event: Record<string, unknown>) => Promise<void>>;

const pluginDir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(pluginDir, "..", "..", "dingtalk-notifier.json");
const logPath = resolve(pluginDir, "..", "..", "dingtalk-notifier.log");
let lastSentAt = 0;

const plugin: Plugin = {
  id: "dingtalk-notifier",
  server: async () => {
    const config = await loadConfig();
    if (config.enabled === false) return {};
    const handlers: EventHandlerMap = {};
    for (const eventName of config.events ?? ["session.idle"]) {
      handlers[eventName] = async (event) => {
        try {
          await notify(eventName, event, config, process.argv.includes("run"));
        } catch (error) {
          await logDiagnostic("send failed", error instanceof Error ? error.message : String(error));
        }
      };
    }
    return handlers;
  },
};

async function loadConfig(): Promise<DingTalkNotifierConfig> {
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as DingTalkNotifierConfig;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function notify(
  eventName: string,
  event: Record<string, unknown>,
  config: DingTalkNotifierConfig,
  detached: boolean,
): Promise<void> {
  if (config.require_review_before_send ?? true) {
    await logDiagnostic("pending review", reviewPrompt(eventName, event, config));
    return;
  }

  const webhook = envValue(config.webhook_env ?? "AI_SHARE_DINGTALK_WEBHOOK");
  if (!webhook) {
    await logDiagnostic("skip", `${config.webhook_env ?? "AI_SHARE_DINGTALK_WEBHOOK"} is not set`);
    return;
  }
  const now = Date.now();
  const minIntervalMs = config.min_interval_ms ?? 60000;
  if (now - lastSentAt < minIntervalMs) {
    await logDiagnostic("skip", `throttled ${eventName}`);
    return;
  }
  lastSentAt = now;

  const keyword = envValue(config.keyword_env ?? "AI_SHARE_DINGTALK_KEYWORD");
  const title = keyword ? `${keyword} 通知` : "ai-share 通知";
  const content = notificationContent(title, eventName, event);
  const payload = payloadFor(config.message_type ?? "markdown", title, content);
  if (detached) {
    sendDetached(
      webhook,
      payload,
      envValue(config.secret_env ?? "AI_SHARE_DINGTALK_SECRET"),
      config.timeout_ms ?? 10000,
    );
    await logDiagnostic("queued", eventName);
    return;
  }

  await sendDingTalkMessage(
    webhook,
    payload,
    envValue(config.secret_env ?? "AI_SHARE_DINGTALK_SECRET"),
    config.timeout_ms ?? 10000,
  );
  await logDiagnostic("sent", eventName);
}

function sendDetached(webhook: string, payload: DingTalkPayload, secret: string | undefined, timeoutMs: number): void {
  const script = `
const { createHmac } = require("node:crypto");
const { appendFile } = require("node:fs/promises");
const webhook = process.env.AI_SHARE_DINGTALK_DETACHED_WEBHOOK;
const secret = process.env.AI_SHARE_DINGTALK_DETACHED_SECRET;
const payload = JSON.parse(process.env.AI_SHARE_DINGTALK_DETACHED_PAYLOAD || "{}");
const logPath = process.env.AI_SHARE_DINGTALK_DETACHED_LOG;
const timeoutMs = Number(process.env.AI_SHARE_DINGTALK_DETACHED_TIMEOUT_MS || "10000");
async function log(reason, detail) {
  try { await appendFile(logPath, JSON.stringify({ time: new Date().toISOString(), reason, detail }) + "\\n", "utf8"); } catch {}
}
function signedWebhookUrl() {
  const url = new URL(webhook);
  if (!secret) return url.toString();
  const timestamp = Date.now().toString();
  const sign = createHmac("sha256", secret).update(timestamp + "\\n" + secret, "utf8").digest("base64");
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);
  return url.toString();
}
(async () => {
  try {
    const response = await fetch(signedWebhookUrl(), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json();
    if (!response.ok || Number(data.errcode) !== 0) {
      await log("send failed", "HTTP " + response.status + ", errcode " + (data.errcode ?? "unknown"));
      return;
    }
    await log("sent", "detached");
  } catch (error) {
    await log("send failed", error instanceof Error ? error.message : String(error));
  }
})();`;
  const child = spawn("bun", ["--eval", script], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      AI_SHARE_DINGTALK_DETACHED_WEBHOOK: webhook,
      AI_SHARE_DINGTALK_DETACHED_SECRET: secret ?? "",
      AI_SHARE_DINGTALK_DETACHED_PAYLOAD: JSON.stringify(payload),
      AI_SHARE_DINGTALK_DETACHED_LOG: logPath,
      AI_SHARE_DINGTALK_DETACHED_TIMEOUT_MS: String(timeoutMs),
    },
  });
  child.unref();
}

function notificationContent(title: string, eventName: string, event: Record<string, unknown>): string {
  const properties = recordProperty(event, "properties");
  const status =
    stringProperty(recordProperty(properties, "status"), "type") ??
    stringProperty(properties, "status") ??
    stringProperty(event, "status") ??
    (eventName === "session.idle" ? "idle" : "updated");
  return [`## ${title}`, `- 事件：${eventName}`, `- 状态：${status}`, `- 时间：${new Date().toLocaleString()}`].join(
    "\n",
  );
}

function reviewPrompt(eventName: string, event: Record<string, unknown>, config: DingTalkNotifierConfig): string {
  const properties = recordProperty(event, "properties");
  const sessionId = stringProperty(properties, "sessionID") ?? stringProperty(properties, "session_id") ?? "unknown";
  return [
    `event=${eventName}`,
    `session=${sessionId}`,
    "auto-send paused until the assistant reviews notifiable information with the user",
    ...reviewItems(config).map((item) => `review-item=${item}`),
  ].join("; ");
}

function reviewItems(config: DingTalkNotifierConfig): string[] {
  const configured = config.review_items?.filter((item) => item.trim() !== "") ?? [];
  return configured.length > 0 ? configured : ["会话内容摘要", "任务结果", "验证结论", "剩余风险或后续事项"];
}

async function logDiagnostic(reason: string, detail: string): Promise<void> {
  const line = JSON.stringify({ time: new Date().toISOString(), reason, detail });
  try {
    await appendFile(logPath, `${line}\n`, "utf8");
  } catch {
    // Ignore logging errors so notification handling cannot break OpenCode events.
  }
}

function payloadFor(messageType: "text" | "markdown", title: string, content: string): DingTalkPayload {
  if (messageType === "text") return { msgtype: "text", text: { content: content.replace(/^## /, "") } };
  return { msgtype: "markdown", markdown: { title, text: content } };
}

async function sendDingTalkMessage(
  webhook: string,
  payload: DingTalkPayload,
  secret: string | undefined,
  timeoutMs: number,
): Promise<void> {
  const response = await fetch(signedWebhookUrl(webhook, secret), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await response.json()) as DingTalkResponse;
  if (!response.ok || Number(data.errcode) !== 0) {
    throw new Error(`DingTalk notifier failed: HTTP ${response.status}, errcode ${data.errcode ?? "unknown"}`);
  }
}

function signedWebhookUrl(webhook: string, secret: string | undefined): string {
  const url = new URL(webhook);
  if (!secret) return url.toString();
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = createHmac("sha256", secret).update(stringToSign, "utf8").digest("base64");
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);
  return url.toString();
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function recordProperty(value: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const property = value?.[key];
  return property && typeof property === "object" && !Array.isArray(property)
    ? (property as Record<string, unknown>)
    : undefined;
}

function stringProperty(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const property = value?.[key];
  return typeof property === "string" && property.trim() ? property : undefined;
}

export default plugin;
