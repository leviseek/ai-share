import type { GlobalDingTalkNotifier, GlobalYaml } from "../../types.ts";

export type DingTalkNotifierConfig = Required<
  Pick<
    GlobalDingTalkNotifier,
    | "enabled"
    | "webhook_env"
    | "secret_env"
    | "keyword_env"
    | "message_type"
    | "events"
    | "require_review_before_send"
    | "review_items"
    | "min_interval_ms"
    | "timeout_ms"
  >
>;

export function buildDingTalkNotifierConfig(globalConfig: GlobalYaml): DingTalkNotifierConfig {
  const source = globalConfig.dingtalk_notifier ?? {};
  return {
    enabled: source.enabled ?? true,
    webhook_env: source.webhook_env ?? "AI_SHARE_DINGTALK_WEBHOOK",
    secret_env: source.secret_env ?? "AI_SHARE_DINGTALK_SECRET",
    keyword_env: source.keyword_env ?? "AI_SHARE_DINGTALK_KEYWORD",
    message_type: source.message_type ?? "markdown",
    events: source.events ?? ["session.idle"],
    require_review_before_send: source.require_review_before_send ?? true,
    review_items: source.review_items ?? ["会话内容摘要", "任务结果", "验证结论", "剩余风险或后续事项"],
    min_interval_ms: source.min_interval_ms ?? 60000,
    timeout_ms: source.timeout_ms ?? 10000,
  };
}
