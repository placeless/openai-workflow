# Alfred Adapter v2

## Goal

Define the future bridge between Alfred/JXA and La Core without changing live
Alfred behavior in Batch 4.

The adapter contract should make these choices explicit:

- how Alfred calls La Core
- how the development runner finds Deno
- how a future compiled binary is preferred
- which Deno permissions the dev-time runner uses
- which JSON shape Alfred receives
- how launcher and core errors are surfaced

Batch 4 adds a development launcher at `scripts/la-core-dev.sh`, but the
launcher is not wired into `info.plist`.

Batch 5 adds a manual read-only harness at `scripts/la_adapter_harness.js`. It
calls the launcher through `NSTask`, validates stdout JSON, and can render known
core responses as Alfred Script Filter JSON. The harness is documented in
`docs/adapter-harness.md` and is still not wired into the live workflow.

Batch 6 adds one parallel development-only Alfred Script Filter keyword,
`lacore`, that calls the Batch 5 harness for the `commands` mode with
`examples/la.v2.json`. It validates Alfred Script Filter rendering without
replacing or connecting any existing workflow command.

Batch 7 connects the same `lacore` branch to one read-only Text View preview
action. The preview script calls the harness in raw `command` mode and formats
the dry-run JSON for display.

Batch 8 extends that preview with explicit simulated context inputs. The preview
can pass caller-provided `--selection`, `--clipboard`, `--frontmost-app`, and
`--extra` values to the raw harness path, with optional `LA_SIM_*` development
environment fallbacks. It still does not collect real macOS context.

Batch 9 adds `scripts/la_context_probe.js`, a read-only macOS context probe for
manual and preview use. It reads selected text only from explicit argv, reads
plain text clipboard contents only when `--include-clipboard` is passed, and
reads frontmost app metadata only when `--include-frontmost-app` is passed. The
preview forwards normalized scalar context to La Core and shows bundle id/path
metadata only as adapter notes.

Batch 10 adds a parallel development-only Universal Action named
`La Core Preview Selection`. It accepts Alfred-provided text, uses fixed command
`explain`, and opens a read-only Text View wrapper at
`scripts/la_selection_preview.js`, which invokes the existing command preview
with `--selection <text>`. It remains dry-run only and uses
`examples/la.v2.json` through the preview path.

Batch 10.5 adds `scripts/build-dev-workflow.sh`, which packages a temporary copy
of the repo as `dist/La-dev.alfredworkflow` with workflow name `La Dev` and
bundle id `net.placeless.la.dev`. This lets the dev-only `lacore` and
`La Core Preview Selection` branches be imported into Alfred separately from an
installed production workflow.

Batch 10.6 audits clipboard safety. La Core and the adapter scripts do not
intentionally write to the clipboard, and the Universal Action branch does not
read clipboard data. `scripts/la_context_probe.js --include-clipboard` remains
an explicit read-only probe. Alfred's Universal Action selected-text path may
change the system clipboard and/or record the selected text in Alfred Clipboard
History, so the Universal Action preview must not be documented as
clipboard-preserving.

## Non-goals

Batch 10.6 does not:

- switch Alfred to Deno
- modify existing live workflow behavior
- replace existing `ask`, `chat`, `explain`, or `translate` commands
- call providers
- stream responses
- collect selected text by simulating keyboard shortcuts
- write to the clipboard from La scripts
- read clipboard or frontmost app data in the Universal Action branch
- execute tools
- implement MCP or embeddings
- write history or store data
- copy, paste, or replace text
- compile binaries
- migrate v1 config
- use the real user config
- modify `prefs.plist`
- replace `scripts/llm.js` or any other current runtime script

## Boundary

```text
Alfred/JXA adapter:
  - read Alfred variables
  - receive selected text from Universal Action
  - optionally collect clipboard/frontmost app later
  - call La Core
  - transform La Core JSON to Alfred UI if needed
  - handle paste/copy/replace later

La Core:
  - load config
  - validate config
  - resolve command
  - normalize request
  - build prompt later
  - call model later
  - write store later
  - return structured JSON
```

`info.plist` remains the live Alfred routing source until a later batch switches
specific workflow objects deliberately. Batch 7 adds only the isolated
development keyword `lacore` and its read-only preview action; current JXA
scripts continue to own the v1 runtime path.

## Alfred responsibilities

The future Alfred/JXA adapter should stay thin and macOS-specific:

- read Alfred variables such as query, command id, selected text, workflow data,
  and workflow cache paths
- receive selected text from Universal Action
- decide which La Core command to call for the current Alfred entry point
- optionally collect clipboard and frontmost app metadata through the read-only
  Batch 9 context probe
- invoke the launcher or compiled core helper
- parse La Core JSON from stdout
- render `ok: true` responses into Alfred Text View, Script Filter, clipboard,
  paste, or replace-selection behavior as appropriate
- render `ok: false`, invalid JSON, non-zero exit, and launcher failures as safe
  Alfred-visible errors

The adapter should not resolve providers, build model payloads, stream provider
responses, mutate the local store directly, or execute tools.

## La Core responsibilities

La Core should own portable runtime behavior:

- load v2 config from `--config`, `LA_CONFIG`, or the default path
- validate v2 config
- resolve quick and explicit commands
- normalize request context
- build prompt and model payloads in later batches
- call configured model providers in later batches
- write history/store data in later batches
- enforce tool policy in later batches
- return structured JSON on stdout

La Core should not read Alfred UI objects directly. Alfred-specific rendering
helpers may live in TypeScript later, but Alfred still owns workflow graph
routing.

## Request contract

The target adapter-to-core request is a JSON object. Batch 3 and Batch 4 still
use CLI arguments, but future Alfred calls should be able to send this shape
without changing the core model:

```json
{
  "entry": "universal_action",
  "command": "explain",
  "message": null,
  "context": {
    "query": null,
    "selection": "Hola mundo",
    "clipboard": null,
    "frontmost_app": null,
    "extra": null
  },
  "output": {
    "mode": "show"
  }
}
```

Fields:

- `entry`: Alfred entry point or core mode, such as `quick`, `universal_action`,
  `keyword`, `fallback`, or a command kind like `ai_command`.
- `command`: v2 command id. Quick AI may omit this in the future if La Core is
  asked to resolve the default quick command.
- `message`: user text when the entry point has a direct query. Use `null` when
  the request is purely selection-driven.
- `context.query`: Alfred query text.
- `context.selection`: selected text supplied by Universal Action.
- `context.clipboard`: optional clipboard text, disabled by default and read
  only when an adapter explicitly opts in.
- `context.frontmost_app`: optional app metadata, disabled by default and read
  only when an adapter explicitly opts in. Batch 9 forwards the app name to La
  Core and keeps bundle id/path in adapter notes.
- `context.extra`: optional explicit one-off context.
- `output.mode`: requested Alfred output behavior. `show` is the safe default.

Current Batch 3 CLI mapping:

```text
quick "hello"
  -> resolve the default quick_ai command and set context.query/message to hello

command explain --selection "Hola mundo"
  -> resolve command explain and set context.selection to Hola mundo

commands
  -> list configured commands for a future Alfred chooser

config-check
  -> validate the v2 config and return health JSON
```

The CLI also accepts `--config`, `--clipboard`, `--frontmost-app`, and `--extra`
as development-only stand-ins for future Alfred-collected context. The preview
script forwards the same simulated context subset through the harness when those
values are provided explicitly.

## Response contract

La Core stdout is the only machine-readable channel. Successful responses must
be structured JSON with `ok: true`.

Successful dry-run:

```json
{
  "ok": true,
  "mode": "dry_run",
  "request": {},
  "resolved_command": {},
  "notes": []
}
```

Batch 3 dry-run responses include:

- `mode`: `dry_run`, `commands`, or `config_check`
- `request`: normalized request for command execution modes
- `resolved_command`: command summary for command execution modes
- `notes`: development notes, currently including that model calls are skipped

Future non-dry-run responses should keep `ok: true` and add mode-specific
payloads rather than replacing the top-level contract.

## Error contract

Core and launcher errors should also be structured JSON.

```json
{
  "ok": false,
  "error": {
    "code": "UNKNOWN_COMMAND",
    "message": "Command not found: explain"
  }
}
```

Current core error codes include:

- `CLI_USAGE`
- `CONFIG_INVALID`
- `CONFIG_LOAD_FAILED`
- `NO_QUICK_COMMAND`
- `UNKNOWN_COMMAND`

Batch 4 launcher errors include:

- `DENO_NOT_FOUND`
- `CORE_BIN_NOT_EXECUTABLE`
- `DENO_BIN_NOT_EXECUTABLE`
- `LAUNCHER_FAILED`

Alfred should treat outcomes as follows:

| Outcome                          | Alfred handling                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `ok: true`                       | Render according to `mode` and `output.mode`.                                         |
| `ok: false`                      | Show `error.message`; keep `error.code` available for debugging.                      |
| Non-zero exit with valid JSON    | Prefer the JSON error payload over generic process text.                              |
| Non-zero exit without valid JSON | Show a generic adapter failure and include a short diagnostic.                        |
| Invalid JSON on stdout           | Treat as adapter/core contract failure; do not attempt paste/copy mutations.          |
| stderr output                    | Ignore for JSON parsing; surface only as debug context when stdout fails.             |
| Deno not found                   | Show `DENO_NOT_FOUND` message and suggest `LA_DENO_BIN` or installing Deno.           |
| Config not found                 | Show the core `CONFIG_LOAD_FAILED` message.                                           |
| Permission denied                | Show the launcher/core error and do not retry with broader permissions automatically. |

The adapter must never mix human-readable status text into stdout before parsing
La Core JSON.

## Deno resolution

The development launcher resolves execution in this order:

1. `LA_CORE_BIN`, if set and executable
2. repo-local compiled binary path, if present and executable
3. `LA_DENO_BIN`, if set and executable
4. `deno` from `PATH`
5. common Homebrew paths:
   - `/opt/homebrew/bin/deno`
   - `/usr/local/bin/deno`

If no Deno executable is found, the launcher prints this JSON to stdout and
exits non-zero:

```json
{
  "ok": false,
  "error": {
    "code": "DENO_NOT_FOUND",
    "message": "Deno executable was not found. Set LA_DENO_BIN or install Deno."
  }
}
```

Explicit override variables are treated as intentional. If `LA_CORE_BIN` or
`LA_DENO_BIN` is set but is not executable, the launcher emits structured JSON
and exits non-zero instead of silently using another runtime.

## Future compiled binary resolution

Development:

```text
Alfred/JXA or wrapper calls Deno directly.
```

Distribution:

```text
deno compile creates a self-contained binary.
Alfred wrapper prefers LA_CORE_BIN or bundled binary.
Deno is no longer required for end users.
```

Likely bundled binary locations:

```text
bin/la
bin/la-arm64
bin/la-x64
```

`scripts/la-core-dev.sh` already checks these future locations, preferring the
architecture-specific name before `bin/la` when possible. Batch 4 does not
compile or add any binary artifact.

## Permission model

Batch 4 uses the minimum permissions needed by the dry-run core:

```text
--allow-read
--allow-env
```

Permission growth should follow command and tool risk:

| La risk     | Future Deno permission        | Use                                                          |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `read`      | `--allow-read`, `--allow-env` | Config, prompts, Alfred-provided context, API key env vars.  |
| `network`   | `--allow-net`                 | Configured model or gateway hosts.                           |
| `write`     | `--allow-write`               | Workflow data, history, logs, caches, and local store paths. |
| `dangerous` | `--allow-run`                 | Explicitly confirmed external commands only.                 |

The adapter should not auto-upgrade permissions after a denial. A later batch
should derive host and path scopes from validated config and workflow paths.

## Development launcher

`scripts/la-core-dev.sh` is a development-only bridge. It is safe to run
manually:

```sh
scripts/la-core-dev.sh config-check --config examples/la.v2.json
scripts/la-core-dev.sh commands --config examples/la.v2.json
scripts/la-core-dev.sh quick "hello" --config examples/la.v2.json
scripts/la-core-dev.sh command explain --selection "Hola mundo" --config examples/la.v2.json
```

The launcher:

- locates the repo root relative to itself
- changes to the repo root so default and example config paths resolve
- prefers a future compiled core helper when present
- otherwise runs `deno run --allow-read --allow-env bin/la.ts ...`
- forwards all arguments to La Core
- preserves La Core stdout JSON exactly
- emits structured JSON only when the launcher fails before invoking La Core

It is not referenced by `info.plist` in Batch 4.

## Future JXA adapter

Batch 5 includes the first manual JXA harness for this flow. A later wired
adapter can build on it, but should still start read-only. Its minimum flow
should be:

1. Build the request from Alfred variables and selected text.
2. Convert the request to the current CLI arguments or a future JSON stdin/API.
3. Run the launcher or compiled helper.
4. Parse stdout as JSON.
5. If `ok: true`, map response/output mode to Alfred UI behavior.
6. If `ok: false`, show a Text View error and avoid mutating clipboard, paste,
   replacement, or store state.

The first wiring batch should start with read-only `show` behavior. Mutating
output modes such as `paste` and `replace_selection` should wait for explicit
confirmation and focused tests.

## Batch 6 through 10 Alfred entry

The first wired entry is intentionally parallel:

```text
lacore -> scripts/la_adapter_harness.js commands --config examples/la.v2.json
```

Its full path is:

```text
Alfred Script Filter -> JXA harness -> scripts/la-core-dev.sh -> Deno La Core -> Alfred Script Filter JSON
```

The keyword uses the example v2 config only. The resulting Script Filter items
include command title, subtitle, arg, `valid`, and `variables.la_command`.
Alfred built-in filtering handles `lacore <query>`; the query is not forwarded
to La Core in Batch 6.

Batch 7 connects Enter to:

```text
selected command -> scripts/la_command_preview.js -> scripts/la_adapter_harness.js --raw command <id> --config examples/la.v2.json
```

The action shows a Text View dry-run summary with command id, kind, model route,
output mode, tools, confirmation requirement, null context fields, and dry-run
notes.

Batch 8 lets that preview action accept explicit simulated context:

```sh
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo" --extra "A1 learner"
osascript -l JavaScript scripts/la_command_preview.js -- explain --frontmost-app "Safari"
```

The preview prefers argv values, then opt-in context probe values, then
`LA_SIM_SELECTION`, `LA_SIM_CLIPBOARD`, `LA_SIM_FRONTMOST_APP`, and
`LA_SIM_EXTRA`, then `null`. The Text View summary renders normalized La Core
context fields such as `selection`, `clipboard`, `frontmost_app`, and `extra`.
It does not connect to providers, copy/paste/replace, tools, or history writes.

Batch 9 inserts the read-only context probe between explicit argv and `LA_SIM_*`
fallbacks when a caller passes include flags:

```sh
osascript -l JavaScript scripts/la_context_probe.js -- --selection "Hola mundo"
osascript -l JavaScript scripts/la_context_probe.js -- --include-frontmost-app
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo" --include-frontmost-app
osascript -l JavaScript scripts/la_command_preview.js -- explain --include-clipboard --max-clipboard-chars 8000
```

Selected text still comes only from Alfred-provided input, explicit argv, or
Batch 8 simulated environment fallback. No `Cmd+C` simulation is used. Clipboard
reads are opt-in, capped, and read-only. Frontmost app reads use
`NSWorkspace.sharedWorkspace.frontmostApplication` where available and do not
require activating apps.

Batch 10 adds a second isolated dev branch:

```text
Universal Action: La Core Preview Selection
  -> scripts/la_selection_preview.js
  -> scripts/la_command_preview.js -- explain --selection <Alfred text>
  -> scripts/la_adapter_harness.js --raw
  -> scripts/la-core-dev.sh
  -> Deno La Core dry-run
  -> Alfred Text View
```

This branch accepts text from Alfred Universal Action input only, uses fixed
command `explain`, and does not read clipboard, read frontmost app metadata,
paste, copy, replace selection, call providers, execute tools, or write history.
It does not add a command picker.

Clipboard safety nuance: the La scripts do not intentionally write selected text
to the clipboard, but Alfred's Universal Action selected-text path may change
the system clipboard and/or record the selected text in Alfred Clipboard
History. For sensitive text, test against `La Dev` only after Alfred clipboard
and Clipboard History behavior is understood or controlled, or clear clipboard
and history through Alfred afterward. The repository does not include any code
to clear Alfred Clipboard History.

To smoke-test only the direct La script path:

```sh
scripts/check-clipboard-preservation.sh
```

That test temporarily writes a sentinel text clipboard value, runs
`scripts/la_selection_preview.js`, checks that `pbpaste` is unchanged, and
restores the previous text clipboard where possible. It proves only the direct
La script path; it does not prove Alfred's Universal Action selected-text path
is clipboard-preserving.

To remove the dev branches, delete the `lacore` Script Filter object, the
command preview Text View object, the `La Core Preview Selection` Universal
Action object, the selection preview Text View object, their connections, and
matching `uidata` entries from `info.plist`. No `prefs.plist` change is needed.

## Testing strategy

Batch 4 verification should cover existing core checks, launcher behavior, and
unchanged Alfred files:

```sh
deno fmt --check
deno lint
deno check bin/la.ts
deno test --allow-read --allow-env

scripts/la-core-dev.sh config-check --config examples/la.v2.json
scripts/la-core-dev.sh commands --config examples/la.v2.json
scripts/la-core-dev.sh quick "hello" --config examples/la.v2.json
scripts/la-core-dev.sh command explain --selection "Hola mundo" --extra "A1 learner" --config examples/la.v2.json
scripts/build-dev-workflow.sh
test -f dist/La-dev.alfredworkflow

osascript -l JavaScript scripts/la_adapter_harness.js -- --raw commands --config examples/la.v2.json
osascript -l JavaScript scripts/la_adapter_harness.js -- commands --config examples/la.v2.json
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo" --extra "A1 learner"
osascript -l JavaScript scripts/la_context_probe.js -- --selection "Hola mundo"
osascript -l JavaScript scripts/la_context_probe.js -- --include-frontmost-app
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo" --include-frontmost-app
osascript -l JavaScript scripts/la_selection_preview.js -- "Hola mundo"
scripts/check-clipboard-preservation.sh
osascript -l JavaScript scripts/la_command_preview.js -- ask

plutil -lint info.plist prefs.plist
python3 -m json.tool config/alfred/la.json
python3 -m json.tool examples/la.v2.json

for f in scripts/*.js; do osacompile -l JavaScript -o /tmp/la-test.scpt "$f"; done
rm -f /tmp/la-test.scpt
```

Run `shellcheck scripts/la-core-dev.sh`,
`shellcheck scripts/build-dev-workflow.sh`, and
`shellcheck scripts/check-clipboard-preservation.sh` when ShellCheck is
available.

## Migration path

1. Keep Batch 4 non-wired and manual only.
2. Add focused tests for adapter request and response transformations.
3. Add a JXA adapter that calls the launcher for one read-only command path.
4. Compare JXA adapter output with current Text View expectations.
5. Switch one Alfred object only after the contract is proven.
6. Add model calls and `--allow-net` in a separate provider batch.
7. Add store writes and `--allow-write` only when history/store behavior moves
   into La Core.
8. Add `deno compile` packaging after the CLI and adapter contracts stabilize.
