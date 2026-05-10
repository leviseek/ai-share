#!/usr/bin/env sh

opencode_apply_proxy_env() {
  config_dir="$1"
  proxy_config="$config_dir/proxy.json"
  if [ "${AI_SHARE_PROXY:-}" = "0" ] || [ "${AI_SHARE_PROXY:-}" = "false" ]; then return 0; fi
  if [ ! -f "$proxy_config" ] || ! command -v bun > /dev/null 2>&1; then return 0; fi

  proxy_url="${AI_SHARE_PROXY_URL:-}"
  if [ -z "$proxy_url" ]; then
    proxy_url="$(bun -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (c.enabled === false) process.exit(2); const protocol=process.env.AI_SHARE_PROXY_PROTOCOL || c.protocol || 'http'; const host=process.env.AI_SHARE_PROXY_HOST || c.host || '127.0.0.1'; const port=process.env.AI_SHARE_PROXY_PORT || c.port || 7897; process.stdout.write(protocol + '://' + host + ':' + port);" "$proxy_config" 2>/dev/null || true)"
  fi
  [ -n "$proxy_url" ] || return 0

  no_proxy="${AI_SHARE_NO_PROXY:-}"
  if [ -z "$no_proxy" ]; then
    no_proxy="$(bun -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const values=Array.isArray(c.no_proxy) ? c.no_proxy : ['localhost','127.0.0.1','::1']; process.stdout.write(values.join(','));" "$proxy_config" 2>/dev/null || true)"
  fi

  : "${HTTP_PROXY:=$proxy_url}"
  : "${HTTPS_PROXY:=$proxy_url}"
  : "${ALL_PROXY:=$proxy_url}"
  export HTTP_PROXY HTTPS_PROXY ALL_PROXY
  : "${http_proxy:=$HTTP_PROXY}"
  : "${https_proxy:=$HTTPS_PROXY}"
  : "${all_proxy:=$ALL_PROXY}"
  export http_proxy https_proxy all_proxy
  if [ -n "$no_proxy" ]; then
    : "${NO_PROXY:=$no_proxy}"
    export NO_PROXY
    : "${no_proxy:=$NO_PROXY}"
    export no_proxy
  fi
}

opencode_live2d_pet_start() {
  config_dir="$1"
  entry="$config_dir/plugins/live2d-pet/standalone.js"
  log_file="$config_dir/live2d-pet-launcher.log"

  if ! command -v bun > /dev/null 2>&1; then
    printf '%s\n' "缺少 bun，无法启动 Live2D pet。" >&2
    return 1
  fi

  if [ ! -f "$entry" ]; then
    printf '%s\n' "缺少 Live2D pet 独立入口：$entry" >&2
    printf '%s\n' "请先运行：bun run ai:gen -- --force" >&2
    return 1
  fi

  if [ -n "${LIVE2D_PET_PID:-}" ] && kill -0 "$LIVE2D_PET_PID" 2>/dev/null; then
    return 0
  fi

  mkdir -p "$config_dir"
  bun "$entry" >"$log_file" 2>&1 &
  LIVE2D_PET_PID=$!
  sleep 1
  if ! kill -0 "$LIVE2D_PET_PID" 2>/dev/null; then
    printf '%s\n' "Live2D pet 未能启动，详情请查看日志：$log_file" >&2
    LIVE2D_PET_PID=""
  fi
}

opencode_live2d_pet_stop() {
  if [ -n "${LIVE2D_PET_PID:-}" ] && kill -0 "$LIVE2D_PET_PID" 2>/dev/null; then
    kill "$LIVE2D_PET_PID" 2>/dev/null || true
    wait "$LIVE2D_PET_PID" 2>/dev/null || true
  fi
  LIVE2D_PET_PID=""
}

opencode_context_guard() {
  command_name="$1"
  launcher="$2"
  config_path="$3"
  config_dir="$4"
  shift 4

  db_path="$HOME/.local/share/opencode/opencode.db"
  guard_script="$(dirname "$0")/opencode-context-guard.ts"
  guard_config="$config_dir/context-guard.json"
  if [ ! -f "$guard_script" ] || ! command -v bun > /dev/null 2>&1; then return 0; fi

  if [ "$command_name" = "check" ]; then
    bun "$guard_script" check "$launcher" "$config_path" "$guard_config" "$db_path" -- "$@"
  else
    bun "$guard_script" rescue "$launcher" "$1" "$guard_config" "$db_path"
  fi
}

opencode_context_guard_watch() {
  launcher="$1"
  config_path="$2"
  config_dir="$3"
  cwd="$4"
  parent_pid="$5"

  db_path="$HOME/.local/share/opencode/opencode.db"
  guard_script="$(dirname "$0")/opencode-context-guard.ts"
  guard_config="$config_dir/context-guard.json"
  config_profile_dir=$(dirname "$config_path")
  strategy_config="$config_profile_dir/strategy.json"
  if [ ! -f "$strategy_config" ]; then
    strategy_config="$config_dir/strategy.json"
  fi
  watch_log_dir="$config_dir/context-guard-watch/logs"
  mkdir -p "$watch_log_dir"
  stdout_log="$watch_log_dir/$parent_pid.log"
  stderr_log="$watch_log_dir/$parent_pid.err.log"
  if [ ! -f "$guard_script" ] || [ ! -f "$strategy_config" ] || ! command -v bun > /dev/null 2>&1; then return 0; fi

  bun "$guard_script" watch "$launcher" "$config_path" "$guard_config" "$strategy_config" "$db_path" "$cwd" "$parent_pid" >> "$stdout_log" 2>> "$stderr_log" &
}
