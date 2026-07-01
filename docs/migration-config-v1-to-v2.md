# Config v1 to v2 Migration Plan

This plan is documentation-only. It describes how a future implementation can migrate the current `providers` plus `tasks` config into the v2 `providers`, `model_routes`, `commands`, `context`, `tools`, `store`, and `output` model.

## Current v1 Shape

The current config is read from Alfred's `config` workflow variable. `scripts/resolve_config.js` loads the selected `task`, merges provider settings into that task, resolves prompt files, and emits a runtime `recipe` for `scripts/llm.js`.

Important v1 assumptions:

- `providers` contain endpoints, API keys, and model aliases.
- `tasks` are both user-facing commands and model request configuration.
- `task.provider`, `task.model`, `task.parameters`, `task.api_style`, and `task.cf_aig_mode` are resolved into a single recipe.
- `task.prompts` may be inline text or a Markdown file under `prompts/`.
- `task.extra` may point to another prompt file and is prepended to the prompt.
- `task.max_context` controls how much recent chat is sent.
- `task.tools` is passed through to provider payloads.

## Migration Map

| v1 | v2 |
| --- | --- |
| `providers` | `providers`, with `api_style`, `api_key_env`, `api_key`, `endpoint`, and `models`. |
| `providers.cloudflare` | `gateways.cloudflare` when used for Cloudflare AI Gateway routing. |
| `tasks` | `commands`. The task key becomes the command ID. |
| `task.description` | `commands.<id>.description`. |
| `task.provider` + `task.model` + `task.parameters` | Prefer `model_routes.<route>`. Use command-level overrides only for exceptional cases. |
| `task.api_style` | `providers.<provider>.api_style`. |
| `task.cf_aig_mode` | `model_routes.<route>.gateway` or `providers.<provider>.gateway`. |
| `task.prompts` | `commands.<id>.prompt`. |
| `task.tools` | `commands.<id>.tools`, with IDs defined under `tools.registry`. |
| `task.max_context` | `commands.<id>.context` using `recent_chat` with `max_messages`, or `store.history.default_context_messages`. |
| `task.extra` | `context.sources.profile`, `context.sources.preferences`, or a command-level `context` entry. |

## Command Mapping

v1 task keys map naturally to v2 command IDs:

- `ask` becomes a `quick_ai` command.
- `explain` becomes an `ai_command`.
- `translate` becomes an `ai_command`.

New v2 commands such as `rewrite`, `summarize`, and `history_search` can be added as examples without changing current workflow behavior.

## Model Route Extraction

Migration should extract repeated model settings into route names.

Example:

```json
{
  "model_routes": {
    "quick": {
      "provider": "google-ai-studio",
      "model": "gemini-2.5-flash",
      "parameters": {
        "temperature": 0.1
      },
      "gateway": "cloudflare"
    },
    "cheap": {
      "provider": "groq",
      "model": "qwen-qwq-32b",
      "parameters": {
        "temperature": 0
      }
    }
  }
}
```

Then commands can use:

```json
{
  "model_route": "quick"
}
```

instead of repeating provider details.

## Prompt Migration

Prompt migration should preserve the existing behavior:

- Inline `prompts` becomes `{ "type": "inline", "text": "..." }`.
- Markdown prompt filenames become `{ "type": "file", "path": "prompts/<name>.md" }`.
- Existing `extra` files should not be concatenated during migration. They should become explicit context sources so users can see when profile or preferences are sent.

Example:

```json
{
  "prompt": {
    "type": "file",
    "path": "prompts/explain.md"
  },
  "context": ["query", "selection", "profile"]
}
```

## Tools Migration

v1 provider-native tool objects should be converted into named v2 tool IDs.

Example:

```json
{
  "tools": {
    "registry": {
      "web_search": {
        "risk": "network",
        "provider_tools": {
          "google": [{ "googleSearch": {} }]
        }
      }
    }
  },
  "commands": {
    "ask": {
      "tools": ["web_search"]
    }
  }
}
```

Provider-native payload details should stay inside the tool registry or provider adapter, not inside every command.

## Store Migration

Batch 2 does not change user data layout. A future migration should keep current readable files:

- active chat: `{alfred_workflow_data}/chat.json`
- archives: `{alfred_workflow_data}/archive/*.json`
- stream cache: `{alfred_workflow_cache}/stream.txt`
- stream PID: `{alfred_workflow_cache}/pid.txt`

New indexes, summaries, event logs, SQLite files, or embeddings should be optional caches. They must be rebuildable from raw history files or safe to delete.

## Ambiguous Cases

Manual review is needed for:

- `extra`: It may mean profile, preferences, task reference material, or temporary context.
- `context` workflow variables: Current Alfred routing sometimes prepends one-off context. v2 should model this as `extra` context, but exact UI semantics need implementation design.
- `tools`: Provider-native structures do not always map cleanly across providers.
- `api_style`: Some providers expose both OpenAI-compatible and native APIs. Migration should preserve the working endpoint style, not infer from provider name alone.
- output behavior: Current commands mostly show Text View output, but translate/rewrite-style commands may later prefer copy, paste, or replace-selection.
- `max_context`: Some commands want recent chat; one-shot transforms probably should not inherit chat unless explicitly configured.

## Suggested Migration Steps

1. Add v2 docs and example config.
2. Add a validation command for v2 config without using it at runtime.
3. Add a migration helper that reads v1 and writes v2 beside it.
4. Teach `resolve_config.js` to detect v1 versus v2 and emit the same runtime recipe.
5. Move provider/tool/context expansion behind small adapters.
6. Switch Alfred task listing from v1 `tasks` to v2 `commands`.
7. Keep v1 compatibility for at least one release after v2 runtime support lands.

## Non-Goals For Batch 2

- Do not implement runtime v2 parsing.
- Do not modify Alfred workflow behavior.
- Do not rewrite scripts.
- Do not add dependencies.
- Do not implement MCP.
- Do not implement embeddings.
- Do not change existing chat, archive, or cache paths.
