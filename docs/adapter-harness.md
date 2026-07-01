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

Batch 8 keeps that path read-only and adds explicit simulated context to the
preview action. The preview script can accept `--selection`, `--clipboard`,
`--frontmost-app`, and `--extra`, then forwards those values through the raw
harness path to La Core. These are caller-provided simulation values only; the
preview still does not collect real macOS context.

Batch 9 adds a small read-only macOS context probe at
`scripts/la_context_probe.js`. The probe can read explicit selected text from
argv, read plain text clipboard contents only when `--include-clipboard` is
passed, and read frontmost app metadata only when `--include-frontmost-app` is
passed. `scripts/la_command_preview.js` can call that probe for opt-in preview
context and still forwards only scalar strings to La Core.

Batch 10 adds a parallel development-only Universal Action named
`La Core Preview Selection`. It accepts Alfred-provided text, opens a dedicated
read-only Text View wrapper at `scripts/la_selection_preview.js`, and uses the
existing preview path with fixed command `explain` and `--selection <text>`. The
branch uses `examples/la.v2.json` through the preview script and remains dry-run
only.

## Non-goals

Batch 10.6 does not:

- change live Alfred behavior
- collect selected text by simulating keyboard shortcuts
- write to the clipboard from La scripts
- read clipboard or frontmost app metadata in the Universal Action branch
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
harness never reads the real clipboard or frontmost app. Batch 9 keeps live
macOS reads isolated to `scripts/la_context_probe.js`, and the preview script
calls that probe only when an include flag is present.

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

## Preview context collection

The read-only preview script accepts the same explicit context subset as the
harness and can also opt into the Batch 9 context probe:

```sh
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo"
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo" --extra "A1 learner"
osascript -l JavaScript scripts/la_command_preview.js -- rewrite --clipboard "rough draft"
osascript -l JavaScript scripts/la_command_preview.js -- explain --frontmost-app "Safari"
osascript -l JavaScript scripts/la_command_preview.js -- explain --include-frontmost-app
osascript -l JavaScript scripts/la_command_preview.js -- explain --include-clipboard --max-clipboard-chars 8000
```

The preview resolves context in this order:

1. argv values
2. context probe values explicitly requested by include flags
3. simulated environment values
4. `null`

The supported simulated environment variables are:

- `LA_SIM_SELECTION`
- `LA_SIM_CLIPBOARD`
- `LA_SIM_FRONTMOST_APP`
- `LA_SIM_EXTRA`

The context probe can be run manually:

```sh
osascript -l JavaScript scripts/la_context_probe.js -- --selection "Hola mundo"
osascript -l JavaScript scripts/la_context_probe.js -- --include-clipboard
osascript -l JavaScript scripts/la_context_probe.js -- --include-frontmost-app
osascript -l JavaScript scripts/la_context_probe.js -- --selection "Hola mundo" --include-frontmost-app
```

Clipboard reading is opt-in and returns a simple object with `text`,
`available`, and `truncated`. The default clipboard text limit is 8000
characters and can be changed with `--max-clipboard-chars <n>`. The probe does
not write to `NSPasteboard`, synthesize `Cmd+C`, activate applications, paste,
copy, replace selection, or call La Core.

Frontmost app reading uses the current macOS frontmost application metadata
where available. The preview forwards only the app name as La Core
`frontmost_app` context. Bundle id and path are shown as adapter notes in the
Text View summary when present.

The resulting Text View summary includes the normalized context names returned
by La Core:

```text
Context
- query: null
- selection: Hola mundo
- clipboard: null
- frontmost_app: Safari
- extra: A1 learner
```

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
uses `examples/la.v2.json`, and can pass explicit simulated selection,
clipboard, frontmost app, and extra context when those values are provided by
argv or `LA_SIM_*` development variables. Batch 9 also lets manual preview calls
opt into the read-only probe with `--include-clipboard` or
`--include-frontmost-app`. Selected text still comes only from Alfred input,
explicit argv, or simulated environment fallback; no global selected-text
scraping or keyboard shortcut simulation is used. The preview does not connect
to copy, paste, replace-selection, model calls, tool execution, or store writes.

Batch 10 adds:

```text
Universal Action: La Core Preview Selection -> scripts/la_selection_preview.js -> scripts/la_command_preview.js -- explain --selection <text>
```

The action accepts text input from Alfred only, uses fixed command `explain`,
does not present a command picker, does not read clipboard or frontmost app
metadata, and does not connect to existing Universal Action branches. Empty
selection is allowed and renders as an empty/null selection in the dry-run
preview.

## Clipboard safety notes

Batch 10.6 audited the dev adapter path:

```text
Alfred input -> scripts/la_selection_preview.js -> scripts/la_command_preview.js -> scripts/la_adapter_harness.js -> scripts/la-core-dev.sh -> La Core
```

The La scripts on this path do not intentionally write to the system clipboard:
there is no `pbcopy`, `setString`, `clearContents`, synthetic `Cmd+C`,
`System Events` keystroke, paste, copy, or replace-selection call in the dev
path. `scripts/la_context_probe.js --include-clipboard` can read plain text from
`NSPasteboard`, but only when explicitly requested.

This does not mean Universal Action previews are clipboard-preserving. Alfred's
Universal Action selected-text path may change the system clipboard and/or
record the selected text in Alfred Clipboard History even when La never wrote
it. For sensitive text, avoid testing the Universal Action preview unless Alfred
clipboard and Clipboard History behavior is understood or controlled. Do not add
code that clears Alfred Clipboard History.

`scripts/check-clipboard-preservation.sh` is a direct-path smoke test. It
temporarily writes a sentinel text clipboard value, runs
`scripts/la_selection_preview.js -- "Hola mundo"`, verifies `pbpaste` still
returns the sentinel, and restores the previous text clipboard when possible. It
only proves that the direct La script path did not change the text clipboard; it
does not prove that Alfred's Universal Action selected-text path is
clipboard-preserving.

## Build dev workflow

Batch 10.5 adds `scripts/build-dev-workflow.sh` so the development-only Alfred
branches can be imported and manually tested without overwriting the installed
production workflow:

```sh
scripts/build-dev-workflow.sh
open dist/La-dev.alfredworkflow
```

The script copies only the files needed by the dev workflow into a temporary
build directory, patches that copy of `info.plist` to name `La Dev` and bundle
id `net.placeless.la.dev`, then writes `dist/La-dev.alfredworkflow`. Source
`info.plist` and `prefs.plist` are not modified. Deno still needs to be
discoverable by `scripts/la-core-dev.sh` at runtime unless a compiled binary is
added later.

To remove the dev entries later, delete the `info.plist` Script Filter object
with keyword `lacore` and uid `C3A0B8B9-2A50-4B8B-AE38-76D023F68F4C`, its
preview Text View object with uid `D3C2B7F16-7B8F-4C50-832B-9D7413D6C2A8`, the
Universal Action object with uid `1DCA2182-6AAC-4BFC-8537-F0A250AC21DE`, its
selection preview Text View object with uid
`26BF14CE-F3C6-429C-8658-A0D40662566B`, their connections, and matching `uidata`
entries. No `prefs.plist` change is required.

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
scripts/la-core-dev.sh command explain --selection "Hola mundo" --extra "A1 learner" --config examples/la.v2.json
```

Harness raw checks:

```sh
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw commands --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw quick "hello" --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- --raw command explain --selection "Hola mundo" --extra "A1 learner" --config examples/la.v2.json
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
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo" --extra "A1 learner"
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo" --include-frontmost-app
osascript -l JavaScript scripts/la_command_preview.js -- ask
osascript -l JavaScript scripts/la_selection_preview.js -- "Hola mundo"
osascript -l JavaScript scripts/la_context_probe.js -- --selection "Hola mundo"
osascript -l JavaScript scripts/la_context_probe.js -- --include-frontmost-app
scripts/check-clipboard-preservation.sh
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
shellcheck scripts/build-dev-workflow.sh
shellcheck scripts/check-clipboard-preservation.sh
git diff --check
```

## Why command execution is not wired yet

The `lacore` keyword proves Script Filter rendering without changing current
Alfred behavior. Command execution still needs a deliberate later batch that
chooses one read-only action, compares user-visible output with the current
workflow, and keeps mutating actions such as copy, paste, replace-selection,
store writes, model calls, streaming, tools, and MCP out of scope until their
contracts are separately tested.
