# Config v2 Design

Config v2 is a design target for a future runtime refactor. It does not describe current runtime behavior.

The model is organized around:

```text
providers
model_routes
commands
context
tools
store
output
```

The goal is to evolve v1 `tasks` into explicit `commands`, inspired by Raycast AI Commands but kept local-first, Alfred-friendly, and easy to edit by hand.

## Format

Recommended format: strict JSON.

| Format | Notes |
| --- | --- |
| JSON | Best fit for the current JXA runtime because it can be parsed with `JSON.parse`, validated with standard tooling, and checked in CI without new dependencies. |
| JSONC | Nice for comments, but would require comment stripping or a parser dependency before `JSON.parse`; defer until there is a real parser layer. |
| YAML | Human-friendly, but indentation and implicit typing add avoidable ambiguity for an Alfred workflow config. |
| TOML | Good for simple config, but nested command/tool objects become verbose as the model grows. |
| Markdown with frontmatter | Good for prompt files, not for the primary machine-readable workflow config. |

v2 should use strict JSON first. If JSONC is added later, validation should parse JSONC into plain JSON and then run the same schema checks used for strict JSON.

Runtime alignment: `docs/runtime-review.md` recommends Deno + TypeScript for the future La Core implementation. This does not change the config format choice; strict JSON remains the first target because it is easy to parse from both the current JXA runtime and a future Deno CLI.

## Providers

`providers` define API endpoints, API style, auth lookup, and model aliases. They should avoid provider-specific command logic.

Provider fields:

- `api_style`: `openai` or `google`.
- `endpoint`: Base endpoint for the provider.
- `api_key_env`: Environment variable name to read first.
- `api_key`: Optional literal value. This is a fallback for users who cannot set environment variables.
- `models`: Map of local model aliases to provider model IDs.
- `default_headers`: Optional static headers for OpenAI-compatible services.
- `gateway`: Optional Cloudflare AI Gateway routing by default for this provider.

Cloudflare AI Gateway should be modeled as routing metadata, not as a normal model provider. A route or provider may opt into a gateway by name.

```json
{
  "providers": {
    "google-ai-studio": {
      "api_style": "google",
      "endpoint": "https://generativelanguage.googleapis.com",
      "api_key_env": "GOOGLE_AI_STUDIO_API_KEY",
      "api_key": "",
      "models": {
        "gemini-flash": "gemini-2.5-flash-preview-04-17"
      }
    }
  },
  "gateways": {
    "cloudflare": {
      "kind": "cloudflare_ai_gateway",
      "endpoint": "https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/GATEWAY_ID",
      "api_key_env": "CLOUDFLARE_AI_GATEWAY_TOKEN",
      "api_key": ""
    }
  }
}
```

## Model Routes

`model_routes` let commands choose intent-level routes instead of repeating provider, model, and parameters.

Route fields:

- `provider`: Provider key.
- `model`: Model alias from the provider.
- `parameters`: Default model parameters.
- `gateway`: Optional gateway key.
- `description`: Human-readable purpose.

Suggested routes:

- `quick`: low-latency default for Quick AI and short commands.
- `command`: general AI Command route.
- `reasoning`: slower, higher-effort route for complex work.
- `cheap`: low-cost route for frequent lightweight transforms.

Commands may override route parameters only when the override is local to the command.

## Commands

`commands` replace v1 `tasks`. A command is a user-facing Alfred action, not just a provider request.

Recommended shape: an object keyed by command ID. The command ID is the object key; implementations should validate that IDs are stable, unique, lowercase, and Alfred-safe.

Command fields:

- `kind`: `quick_ai`, `ai_command`, `history`, or `utility`.
- `title`: Display title.
- `description`: Short display/help text.
- `prompt`: Inline prompt text or a prompt file reference.
- `model_route`: Route key, or omitted for non-LLM utility commands.
- `context`: Context sources this command may include.
- `tools`: Tool IDs this command may use.
- `output`: Output mode configuration.
- `confirm`: Whether Alfred should ask before running.
- `history`: Whether to write the exchange to chat history.

Command kinds:

- `quick_ai`: chat-like command using query and optional recent chat.
- `ai_command`: focused transform or analysis command.
- `history`: local history listing/searching command.
- `utility`: workflow utility that may not call an LLM.

This four-kind model is enough for v2. More kinds should wait until runtime behavior proves they remove real complexity.

Prompt values can be:

```json
{ "type": "inline", "text": "You are Gemini, an AI assistant created by Google." }
```

or:

```json
{ "type": "file", "path": "prompts/explain.md" }
```

Paths are relative to the config file directory unless explicitly absolute.

## Context

Context should be explicit and conservative. Sending too much local context by default is a privacy and prompt-quality risk.

Context sources:

| Source | Default | Risk | Notes |
| --- | --- | --- | --- |
| `query` | Yes | read | Alfred query or text passed to the command. |
| `selection` | Yes for Universal Actions | read | Selected text passed by Alfred. |
| `clipboard` | No | read | Useful, but can contain secrets. |
| `frontmost_app` | No | read | App name/window metadata only unless expanded later. |
| `extra` | No | read | Explicit one-off context collected by Alfred. |
| `recent_chat` | Yes for `quick_ai` | read | Bounded by command or store settings. |
| `profile` | No | read | User profile prompt, opt-in per command or globally. |
| `preferences` | No | read | Style/language preferences, opt-in per command or globally. |

Command context entries can be strings for simple cases:

```json
"context": ["query", "recent_chat", "profile"]
```

or objects when limits are needed:

```json
"context": [
  { "source": "recent_chat", "max_messages": 4 },
  { "source": "clipboard", "max_chars": 4000 }
]
```

## Tools

`tools` is a registry of possible tools. Commands opt in by tool ID. No tool is globally available to a command unless listed.

Risk classes:

- `read`: Reads local or Alfred-provided data.
- `network`: Contacts a network service.
- `write`: Mutates local data or user-visible state.
- `dangerous`: Runs commands, calls arbitrary MCP tools, deletes data, or can exfiltrate broad local state.

Example tool IDs:

- `web_search`: `network`; maps to provider-native search where available.
- `read_clipboard`: `read`; accesses clipboard text.
- `read_file`: `read`; reads explicit user-selected files.
- `run_shell`: `dangerous`; must require confirmation.
- `mcp_call`: `dangerous`; future-ready only for v2 docs.

Dangerous tools should always require confirmation even when a command sets `confirm` to `false`.

MCP should remain future-ready in v2 design. The config can reserve `mcp_call`, but runtime implementation should wait until command/tool authorization is explicit and testable.

## Store

The store is local-first.

Core principle:

```text
Raw history is stored as ordinary readable local files.
Indexes, summaries, embeddings, or SQLite are rebuildable caches.
```

Store areas:

- `history`: Active chat and archive directory.
- `events`: Optional append-only event logs for future diagnostics or replay.
- `summaries`: Optional generated summaries, rebuildable from raw history.
- `history_search`: Optional local index, rebuildable from raw history.
- `embeddings`: Optional future vector cache, disabled by default.

v2 should not change the current user data layout in the design batch. Later migration can add new store paths only with compatibility handling.

## Output

Output modes define what Alfred does with a command result.

| Mode | Alfred meaning |
| --- | --- |
| `show` | Show the response in Text View. This is the safest default. |
| `copy` | Copy response to the clipboard without pasting. |
| `paste` | Copy and paste into the frontmost app. |
| `replace_selection` | Replace selected text in the frontmost app. Requires confirmation for broad or risky commands. |
| `save` | Save response to a local file selected or configured by the user. |
| `open` | Open a generated file, URL, or Alfred result target. |

Commands should default to `show` unless the command name and user action clearly imply mutation.

## Non-Goals For Batch 2

- No runtime changes.
- No Alfred workflow behavior changes.
- No heavy dependencies.
- No MCP implementation.
- No embeddings implementation.
- No script rewrites.
- No user data layout changes.
