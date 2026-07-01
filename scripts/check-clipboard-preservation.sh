#!/usr/bin/env bash

set -euo pipefail

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || die "required command not found: $name"
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" ||
  die "could not resolve script directory"
repo_root="$(cd -- "$script_dir/.." && pwd -P)" ||
  die "could not resolve repository root"

cd "$repo_root" || die "could not enter repository root"

require_command pbcopy
require_command pbpaste
require_command osascript

original_file="$(mktemp "${TMPDIR:-/tmp}/la-clipboard-original.XXXXXX")" ||
  die "could not create temporary file"
original_available=0

cleanup() {
  local status=$?
  if [[ "$original_available" == "1" ]]; then
    pbcopy <"$original_file" || true
  fi
  rm -f "$original_file"
  exit "$status"
}
trap cleanup EXIT

if pbpaste >"$original_file"; then
  original_available=1
else
  : >"$original_file"
fi

sentinel="LA_CLIPBOARD_SENTINEL_$(date +%s)_$$"
printf '%s' "$sentinel" | pbcopy

osascript -l JavaScript scripts/la_selection_preview.js -- "Hola mundo" \
  >/dev/null

current="$(pbpaste)"
if [[ "$current" != "$sentinel" ]]; then
  die "direct La selection preview changed the text clipboard"
fi

printf '%s\n' "Clipboard preserved by direct La selection preview path."
