# Adapter Harness

## Goal

Batch 5 adds a manual, read-only JXA harness at `scripts/la_adapter_harness.js`.
It proves that a future Alfred adapter can collect explicit Alfred-style inputs,
build a safe La Core invocation, call the version-neutral launcher, parse JSON
stdout, and render either raw core JSON or Alfred Script Filter JSON.

The harness is not wired into Alfred. `info.plist`, `prefs.plist`, and the
existing runtime scripts remain the live workflow path.

## Non-goals

Batch 5 does not:

- change live Alfred behavior
- collect real macOS context
- paste, copy, or replace text
- call model APIs
- stream responses
- execute tools
- write to the local store
- migrate v1 config

## How it calls La Core

Run the harness manually from the repository root with `osascript`:

```sh
osascript -l JavaScript scripts/la_adapter_harness.js -- commands --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- quick "hello" --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- command explain --selection "Hola mundo" --config examples/la.v2.json
```

The harness resolves `scripts/la-core-dev.sh` from the current repository root,
or from `LA_REPO_ROOT` when set. It invokes the launcher with `NSTask` and an
argument array, not shell string interpolation. The launcher still owns Deno or
future compiled binary resolution.

The supported parser subset is intentionally small:

- modes: `config-check`, `commands`, `quick`, and `command`
- global flag: `--raw`
- forwarded options: `--config`, `--selection`, `--clipboard`,
  `--frontmost-app`, and `--extra`
- option values must be separate arguments and cannot start with `--`
- text containing spaces should be shell-quoted by the caller

`--clipboard` and `--frontmost-app` are explicit simulated values only. The
harness never reads the real clipboard or frontmost app.

## Raw JSON mode

Raw mode returns valid La Core JSON unchanged when the launcher produces valid
JSON:

```sh
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw commands --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw quick "hello" --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw command explain --selection "Hola mundo" --config examples/la.v2.json
```

If the adapter cannot launch the core, receives empty stdout, or receives
invalid JSON, raw mode returns a structured adapter error:

```json
{
  "ok": false,
  "error": {
    "code": "ADAPTER_INVALID_JSON",
    "message": "La Core stdout was not valid JSON."
  }
}
```

Core errors such as `UNKNOWN_COMMAND` are preserved in raw mode.

## Alfred Script Filter mode

Without `--raw`, the harness converts known core responses to Alfred Script
Filter JSON.

For `commands`, each configured command becomes an actionable item:

```json
{
  "items": [
    {
      "title": "Explain",
      "subtitle": "Explain language elements in the input.",
      "arg": "explain",
      "valid": true,
      "variables": {
        "la_command": "explain",
        "la_command_kind": "ai_command"
      }
    }
  ]
}
```

For dry-run `quick` and `command`, the harness returns a single non-actionable
summary item. The full dry-run request stays available through `--raw`; the
Script Filter conversion is only a future UI preview in this batch.

`config-check` also returns a single non-actionable status item.

## Error handling

When La Core returns:

```json
{
  "ok": false,
  "error": {
    "code": "UNKNOWN_COMMAND",
    "message": "Command not found: missing"
  }
}
```

raw mode preserves that payload. Script Filter mode returns an invalid item:

```json
{
  "items": [
    {
      "title": "La Core Error",
      "subtitle": "UNKNOWN_COMMAND: Command not found: missing",
      "valid": false
    }
  ]
}
```

Adapter failures such as missing launcher, empty stdout, invalid JSON, and
unexpected non-zero exits are reported as structured adapter errors in raw mode
or invalid Script Filter items in Script Filter mode. The harness does not print
human-readable debug output to stdout.

## Smoke tests

Core launcher checks:

```sh
scripts/la-core-dev.sh config-check --config examples/la.v2.json
scripts/la-core-dev.sh commands --config examples/la.v2.json
scripts/la-core-dev.sh quick "hello" --config examples/la.v2.json
scripts/la-core-dev.sh command explain --selection "Hola mundo" --config examples/la.v2.json
```

Harness raw checks:

```sh
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw commands --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw quick "hello" --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw command explain --selection "Hola mundo" --config examples/la.v2.json
```

Harness Script Filter checks:

```sh
osascript -l JavaScript scripts/la_adapter_harness.js -- commands --config examples/la.v2.json | python3 -m json.tool
osascript -l JavaScript scripts/la_adapter_harness.js -- quick "hello" --config examples/la.v2.json | python3 -m json.tool
osascript -l JavaScript scripts/la_adapter_harness.js -- command explain --selection "Hola mundo" --config examples/la.v2.json | python3 -m json.tool
```

Full repository checks for this batch:

```sh
deno fmt --check
deno lint
deno check bin/la.ts
deno test --allow-read --allow-env

plutil -lint info.plist prefs.plist
python3 -m json.tool config/alfred/la.json
python3 -m json.tool examples/la.v2.json

for f in scripts/*.js; do osacompile -l JavaScript -o /tmp/la-test.scpt "$f"; done
rm -f /tmp/la-test.scpt

shellcheck scripts/la-core-dev.sh
git diff --check
```

## Why it is not wired into Alfred yet

The harness proves the adapter-to-core contract without changing current Alfred
behavior. Live wiring still needs a deliberate later batch that chooses one
read-only Alfred object, compares user-visible output with the current workflow,
and keeps mutating actions such as copy, paste, replace-selection, store writes,
model calls, streaming, tools, and MCP out of scope until their contracts are
separately tested.
