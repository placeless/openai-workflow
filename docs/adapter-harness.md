# Adapter Harness

## Goal

Batch 5 added a manual, read-only JXA harness at
`scripts/la_adapter_harness.js`. It proves that a future Alfred adapter can
collect explicit Alfred-style inputs, build a safe La Core invocation, call the
version-neutral launcher, parse JSON stdout, and render either raw core JSON or
Alfred Script Filter JSON.

Batch 6 wires that harness into one parallel development-only Alfred Script
Filter keyword, `lacore`. Existing `ask`, `chat`, `explain`, and `translate`
behavior remains on the current workflow path. `prefs.plist` and the existing
runtime scripts remain unchanged.

Batch 7 connects `lacore` to a read-only Text View preview action. Selecting a
command runs `scripts/la_command_preview.js`, which calls the harness in raw
mode and formats the dry-run response as readable text.

## Non-goals

Batch 7 does not:

- change live Alfred behavior
- collect real macOS context
- paste, copy, or replace text
- call model APIs
- stream responses
- execute tools
- write to the local store
- migrate v1 config
- replace existing workflow commands
- support real user config migration

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

## Alfred dev keyword

Batch 6 adds a parallel Script Filter keyword:

```text
lacore
```

The Alfred object invokes the harness through:

```sh
/usr/bin/osascript -l JavaScript scripts/la_adapter_harness.js -- commands --config examples/la.v2.json
```

The adapter path is:

```text
Alfred Script Filter -> scripts/la_adapter_harness.js -> scripts/la-core-dev.sh -> Deno La Core -> Alfred Script Filter JSON
```

The keyword is development-only, read-only, and dry-run only. It lists commands
from `examples/la.v2.json`; it does not read the real user config. Alfred's
built-in filtering is enabled, so `lacore <query>` filters the rendered command
items without passing the query to La Core.

Batch 7 adds a single downstream Text View action. Pressing Enter on a `lacore`
item shows a dry-run preview for the selected command through:

```text
lacore Script Filter -> scripts/la_command_preview.js -> scripts/la_adapter_harness.js --raw -> scripts/la-core-dev.sh -> Deno La Core
```

The preview uses the item's `arg` or `variables.la_command` as the command id,
uses `examples/la.v2.json`, and passes no selection, clipboard, frontmost app,
or extra context. It does not connect to copy, paste, replace-selection, model
calls, tool execution, or store writes.

To remove the dev entry later, delete the `info.plist` Script Filter object with
keyword `lacore` and uid `C3A0B8B9-2A50-4B8B-AE38-76D023F68F4C`, the preview
Text View object with uid `D3C2B7F16-7B8F-4C50-832B-9D7413D6C2A8`, their
connection and matching `uidata` entries. No `prefs.plist` change is required.

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

Preview checks:

```sh
osascript -l JavaScript scripts/la_command_preview.js -- explain
osascript -l JavaScript scripts/la_command_preview.js -- ask
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

## Why command execution is not wired yet

The `lacore` keyword proves Script Filter rendering without changing current
Alfred behavior. Command execution still needs a deliberate later batch that
chooses one read-only action, compares user-visible output with the current
workflow, and keeps mutating actions such as copy, paste, replace-selection,
store writes, model calls, streaming, tools, and MCP out of scope until their
contracts are separately tested.
