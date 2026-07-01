#!/usr/bin/env bash

set -euo pipefail

readonly DEV_NAME="La Dev"
readonly DEV_BUNDLE_ID="net.placeless.la.dev"
readonly OUTPUT_DIR="dist"
readonly OUTPUT_FILE="La-dev.alfredworkflow"
readonly PLIST_BUDDY="/usr/libexec/PlistBuddy"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || die "required file is missing: $path"
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || die "required command not found: $name"
}

copy_path() {
  local path="$1"
  local build_dir="$2"

  if [[ -e "$path" ]]; then
    rsync -a --exclude '.DS_Store' "$path" "$build_dir/"
  fi
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" ||
  die "could not resolve script directory"
repo_root="$(cd -- "$script_dir/.." && pwd -P)" ||
  die "could not resolve repository root"

cd "$repo_root" || die "could not enter repository root"

require_command rsync
require_command zip
[[ -x "$PLIST_BUDDY" ]] || die "required command not executable: $PLIST_BUDDY"

require_file "info.plist"
require_file "scripts/la-core-dev.sh"
require_file "scripts/la_adapter_harness.js"
require_file "scripts/la_command_preview.js"
require_file "bin/la.ts"
require_file "examples/la.v2.json"

tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/la-dev-workflow.XXXXXX")" ||
  die "could not create temporary directory"
trap 'rm -rf "$tmp_root"' EXIT

build_dir="$tmp_root/La Dev"
mkdir -p "$build_dir" "$OUTPUT_DIR"

copy_path "info.plist" "$build_dir"
copy_path "icon.png" "$build_dir"
copy_path "scripts" "$build_dir"
copy_path "bin" "$build_dir"
copy_path "src" "$build_dir"
copy_path "examples" "$build_dir"
copy_path "deno.json" "$build_dir"
copy_path "README.md" "$build_dir"
copy_path "docs" "$build_dir"

"$PLIST_BUDDY" -c "Set :name $DEV_NAME" "$build_dir/info.plist"
"$PLIST_BUDDY" -c "Set :bundleid $DEV_BUNDLE_ID" "$build_dir/info.plist"
plutil -lint "$build_dir/info.plist" >/dev/null

output_path="$repo_root/$OUTPUT_DIR/$OUTPUT_FILE"
rm -f "$output_path"

(
  cd "$build_dir"
  zip -qr "$output_path" .
)

printf '%s\n' "$output_path"
