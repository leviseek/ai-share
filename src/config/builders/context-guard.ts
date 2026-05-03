import type { GlobalYaml, ProfilesYaml } from "../../types.ts";
import { maxInputTokensForProfile } from "./opencode.ts";
import { requireRecord } from "../validation.ts";

export function buildContextGuardConfig(globalConfig: GlobalYaml): Required<NonNullable<GlobalYaml["context_guard"]>> {
  const source = globalConfig.context_guard ?? {};
  return {
    enabled: source.enabled ?? true,
    warn_ratio: source.warn_ratio ?? 0.5,
    danger_ratio: source.danger_ratio ?? 0.75,
    block_ratio: source.block_ratio ?? 0.9,
    absolute_block_tokens: source.absolute_block_tokens ?? 180000,
    rescue_dir: source.rescue_dir ?? ".opencode-rescue",
    diagnostics: source.diagnostics ?? true,
    watch_interval_ms: source.watch_interval_ms ?? 5000,
    zero_output_limit: source.zero_output_limit ?? 3,
    watch_action: source.watch_action ?? "stop",
    alert_file: source.alert_file ?? ".opencode/context-guard-watch/alert.json",
    history_dir: source.history_dir ?? ".opencode/context-guard-watch/history",
  };
}

export function buildContextGuardProfileConfigs(
  globalConfig: GlobalYaml,
  profilesConfig: ProfilesYaml,
): Record<string, { max_input_tokens: number }> {
  return Object.fromEntries(
    Object.keys(requireRecord(profilesConfig, "profiles")).map((profileId) => [
      profileId,
      { max_input_tokens: maxInputTokensForProfile(globalConfig, profilesConfig[profileId]?.compaction) },
    ]),
  );
}
