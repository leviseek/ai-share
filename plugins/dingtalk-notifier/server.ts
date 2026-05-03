import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type DingTalkNotifierConfig = {
  enabled?: boolean;
  webhook_env?: string;
  secret_env?: string;
  keyword_env?: string;
  message_type?: "text" | "markdown";
  events?: string[];
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

type Plugin = { id: string; server(): Promise<Record<string, (event: Record<string, unknown>) => Promise<void>>> };

const pluginDir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(pluginDir, "..", "..", "dingtalk-notifier.json");
let lastSentAt = 0;

const plugin: Plugin = {
  id: "dingtalk-notifier",
  server: async () => {
    const config = await loadConfig();
    if (config.enabled === false) return {};
    const handlers: Record<string, (event: Record<string, unknown>) => Promise<void>> = {};
    for (const eventName of config.events ?? ["session.status"]) {
      handlers[eventName] = async (event) => notify(eventName, event, config);
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
): Promise<void> {
  const webhook = envValue(config.webhook_env ?? "AI_SHARE_DINGTALK_WEBHOOK");
  if (!webhook) return;
  const now = Date.now();
  const minIntervalMs = config.min_interval_ms ?? 60000;
  if (now - lastSentAt < minIntervalMs) return;
  lastSentAt = now;

  const keyword = envValue(config.keyword_env ?? "AI_SHARE_DINGTALK_KEYWORD");
  const title = keyword ? `${keyword} 通知` : "ai-share 通知";
  const content = notificationContent(title, eventName, event);
  const payload = payloadFor(config.message_type ?? "markdown", title, content);
  await sendDingTalkMessage(
    webhook,
    payload,
    envValue(config.secret_env ?? "AI_SHARE_DINGTALK_SECRET"),
    config.timeout_ms ?? 10000,
  );
}

function notificationContent(title: string, eventName: string, event: Record<string, unknown>): string {
  const status =
    stringProperty(recordProperty(event, "properties"), "status") ?? stringProperty(event, "status") ?? "updated";
  return [`## ${title}`, `- 事件：${eventName}`, `- 状态：${status}`, `- 时间：${new Date().toLocaleString()}`].join(
    "\n",
  );
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

function recordProperty(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const property = value[key];
  return property && typeof property === "object" && !Array.isArray(property)
    ? (property as Record<string, unknown>)
    : undefined;
}

function stringProperty(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const property = value?.[key];
  return typeof property === "string" && property.trim() ? property : undefined;
}

export default plugin;
