#!/usr/bin/env bash

set -euo pipefail

json_error() {
  local code="$1"
  local message="$2"

  printf '{\n'
  printf '  "ok": false,\n'
  printf '  "error": {\n'
  printf '    "code": "%s",\n' "$code"
  printf '    "message": "%s"\n' "$message"
  printf '  }\n'
  printf '}\n'
}

executable_file() {
  local path="$1"
  [[ -n "$path" && -f "$path" && -x "$path" ]]
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" || {
  json_error "LAUNCHER_FAILED" "Could not resolve launcher directory."
  exit 1
}

repo_root="$(cd -- "$script_dir/.." && pwd -P)" || {
  json_error "LAUNCHER_FAILED" "Could not resolve repository root."
  exit 1
}

if ! cd -- "$repo_root"; then
  json_error "LAUNCHER_FAILED" "Could not enter repository root."
  exit 1
fi

if [[ -n "${LA_CORE_BIN:-}" ]]; then
  if executable_file "$LA_CORE_BIN"; then
    exec "$LA_CORE_BIN" "$@"
  fi

  json_error "CORE_BIN_NOT_EXECUTABLE" "LA_CORE_BIN is set but is not executable."
  exit 126
fi

compiled_candidates=()
case "$(uname -m 2>/dev/null || printf unknown)" in
  arm64 | aarch64)
    compiled_candidates+=("$repo_root/bin/la-arm64" "$repo_root/bin/la")
    ;;
  x86_64 | amd64)
    compiled_candidates+=("$repo_root/bin/la-x64" "$repo_root/bin/la")
    ;;
  *)
    compiled_candidates+=("$repo_root/bin/la")
    ;;
esac

for core_bin in "${compiled_candidates[@]}"; do
  if [[ -e "$core_bin" ]]; then
    if executable_file "$core_bin"; then
      exec "$core_bin" "$@"
    fi

    json_error "CORE_BIN_NOT_EXECUTABLE" "Bundled La Core binary is not executable."
    exit 126
  fi
done

deno_bin=""

if [[ -n "${LA_DENO_BIN:-}" ]]; then
  if executable_file "$LA_DENO_BIN"; then
    deno_bin="$LA_DENO_BIN"
  else
    json_error "DENO_BIN_NOT_EXECUTABLE" "LA_DENO_BIN is set but is not executable."
    exit 126
  fi
elif deno_from_path="$(command -v deno 2>/dev/null)" && [[ -n "$deno_from_path" ]]; then
  if executable_file "$deno_from_path"; then
    deno_bin="$deno_from_path"
  fi
fi

if [[ -z "$deno_bin" ]]; then
  for candidate in /opt/homebrew/bin/deno /usr/local/bin/deno; do
    if executable_file "$candidate"; then
      deno_bin="$candidate"
      break
    fi
  done
fi

if [[ -z "$deno_bin" ]]; then
  json_error "DENO_NOT_FOUND" "Deno executable was not found. Set LA_DENO_BIN or install Deno."
  exit 127
fi

exec "$deno_bin" run --allow-read --allow-env bin/la.ts "$@"
