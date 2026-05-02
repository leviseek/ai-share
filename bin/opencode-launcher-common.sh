#!/usr/bin/env sh

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
