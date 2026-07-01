# La Architecture

This document records the current workflow boundaries before the v2 refactor. It is intentionally descriptive: Batch 1 does not change runtime behavior.

## Runtime Shape

La is an Alfred workflow whose runtime is split between Alfred's workflow graph in `info.plist` and JavaScript for Automation scripts in `scripts/`.

The workflow has three main phases:

1. Alfred entry points collect input and set workflow variables such as `task`, `message`, `context`, `new_chat`, and `streaming_now`.
2. `scripts/resolve_config.js` reads the configured `la.json`, resolves the selected task/provider/model, expands prompt files, and emits a single recipe JSON value.
3. Alfred's Text View runs `scripts/llm.js`, which owns chat state, stream process management, provider payload construction, response parsing, and Text View responses.

Persistent chat data lives under Alfred's workflow data directory. Temporary stream data lives under Alfred's workflow cache directory.

## Files And Responsibilities

| File | Responsibility |
| --- | --- |
| `info.plist` | Alfred object graph, entry points, modifier routing, external triggers, Text View wiring, workflow variables, and built-in Alfred actions. |
| `config/alfred/la.json` | Bundled example configuration for providers, tasks, prompt files, model aliases, and task descriptions. |
| `scripts/resolve_config.js` | Converts user configuration plus `task`/`context` variables into the recipe consumed by the LLM runtime. |
| `scripts/llm.js` | Coordinates chat storage, message formatting, provider strategy selection, curl command creation, streaming, response parsing, and final Text View output. |
| `scripts/save_history.js` | Archives the active chat and optionally replaces it with a selected archived chat. |
| `scripts/load_history.js` | Lists archived chats for Alfred Script Filter results and trashes invalid archive files. |
| `scripts/copy_last.js` | Reads the active chat and returns the last assistant message. |
| `scripts/copy_all.js` | Reads the active chat and returns a Markdown transcript. |
| `scripts/list_tasks.js` | Lists configured tasks for Alfred Script Filter results. |
| `scripts/check_config.js` | Validates a La config file and renders health results in Text View. |

## Data Contracts

### User Configuration

The configured JSON file contains top-level `providers` and `tasks` objects. Tasks refer to provider names and model aliases; `resolve_config.js` expands those into runtime values.

Prompt fields may be literal strings or Markdown filenames under a `prompts/` directory next to the config file. The optional `extra` prompt is prepended to the resolved prompt text inside an `EXTRA_REFERENCE` block.

### Runtime Recipe

The runtime recipe passed to `scripts/llm.js` is a resolved task object serialized in Alfred's `recipe` variable. It is expected to contain:

- provider identity and API style
- concrete model ID
- resolved endpoint and API key
- resolved prompt text
- optional parameters, tools, max context, and Cloudflare AI Gateway values

`scripts/llm.js` should treat the recipe as its config boundary. It should not need to read the original config file.

### Chat Files

The active chat is stored at:

```text
{alfred_workflow_data}/chat.json
```

Archived chats are stored at:

```text
{alfred_workflow_data}/archive/*.json
```

A chat file is an array of messages. Runtime validation currently accepts messages with:

- `role`: `user` or `assistant`
- `content`: non-empty string

Assistant messages may also include metadata such as task, provider, and model.

### Stream Files

In-flight streaming state is stored under Alfred's workflow cache:

```text
{alfred_workflow_cache}/stream.txt
{alfred_workflow_cache}/pid.txt
```

`stream.txt` is both curl output and stderr. `pid.txt` stores the curl process ID for interrupt and cleanup paths.

## Refactor Boundaries

The v2 refactor should preserve these boundaries unless a later batch explicitly changes them:

- Alfred routing stays in `info.plist`; scripts should not duplicate modifier or entry-point routing.
- Config resolution stays before the LLM runtime; provider/task aliases should be expanded before `scripts/llm.js` runs.
- Provider adapters own endpoint paths, headers, payload shape, response parsing, and error detection for their API style.
- Chat storage and stream storage are separate. Chat files are persistent state; stream files are transient process state.
- Copy/history scripts read chat files but should not create provider requests.
- Config validation reports health only; it should not mutate user configuration.

## La v2 Batch 1 Scope

Batch 1 is documentation-only:

- Record the existing architecture and data contracts.
- Name the current module boundaries before extracting code.
- Preserve current Alfred variables, file paths, keyboard modifiers, streaming behavior, and provider behavior.
- Avoid runtime changes unless a documentation build or validation step requires them.

Future batches can use this document as the contract for small extractions from `scripts/llm.js` and related scripts.

Batch 2 adds the proposed config v2 design in `docs/config-v2.md`, the migration plan in `docs/migration-config-v1-to-v2.md`, and a strict JSON example in `examples/la.v2.json`.

Batch 2.5 recommends a hybrid v2 runtime in `docs/runtime-review.md`: keep JXA as the Alfred/macOS adapter and move portable La Core responsibilities to Deno + TypeScript in a later batch.

Batch 3 adds the dry-run Deno + TypeScript skeleton documented in `docs/core-skeleton.md`.

Batch 4 defines the future Alfred/JXA to La Core bridge in `docs/alfred-adapter-v2.md` and adds a non-wired development launcher at `scripts/la-core-dev.sh`. It does not change the live Alfred workflow graph or existing JXA runtime.

Batch 5 adds the read-only manual JXA adapter harness documented in `docs/adapter-harness.md`. The harness calls `scripts/la-core-dev.sh`, validates JSON stdout, and can produce Alfred Script Filter JSON for contract testing. It is not referenced by `info.plist` or `prefs.plist`.

## Verification

Documentation-only changes do not require a manual Alfred workflow run. If runtime files change in a later batch, run:

```sh
plutil -lint info.plist prefs.plist
python3 -m json.tool config/alfred/la.json
for script in scripts/*.js; do osacompile -l JavaScript -o "/tmp/$(basename "$script" .js).scpt" "$script"; done
```
