# La 🌶️ - An LLM Alfred Workflow

## Setup

Please create a configuration file, such as `~/.config/alfred/la.json`, tailored to your specific needs. This configuration file should be structured into two main sections: `providers` for your Large Language Model (LLM) providers and `tasks` for the tasks you want the LLMs to perform.

See [docs/architecture.md](docs/architecture.md) for the current workflow architecture and v2 refactor boundaries. The proposed v2 configuration model is documented in [docs/config-v2.md](docs/config-v2.md), with migration notes in [docs/migration-config-v1-to-v2.md](docs/migration-config-v1-to-v2.md), runtime direction in [docs/runtime-review.md](docs/runtime-review.md), the dry-run Deno skeleton in [docs/core-skeleton.md](docs/core-skeleton.md), the future Alfred adapter contract in [docs/alfred-adapter-v2.md](docs/alfred-adapter-v2.md), and the read-only adapter harness in [docs/adapter-harness.md](docs/adapter-harness.md).

Each `provider` entry should include the following:

*   `endpoint`: The API endpoint URL for the LLM provider.
*   `api_key`: Your API key for authentication (optional for Cloudflare provider).
*   `models`: A list of the models available from that provider (not required for Cloudflare provider).

Each `task` entry should potentially specify:

*   `provider`: The name of the provider to use.
*   `model`: The specific model to use from the chosen provider.
*   `api_style`: (Optional) The API style to use. Can be either 'google' or 'openai'. Defaults to 'openai'.
*   `cf_aig_mode`: (Optional) Whether to route the request through Cloudflare AI Gateway. Defaults to false.
*   `parameters`: Any specific parameters to pass to the model (e.g., temperature, top_p).
*   `prompts`: The prompts to be used for the task. Prompts can be either:
    *   Plain text strings.
    *   Paths to Markdown files located in a `./prompts` directory relative to the configuration file's location.
    *   Support for `extra` prompts, which can be used for shared prompts across multiple tasks.
*   `tools`: (Optional) If the model supports tool use, this section allows you to configure the tools to be used within the task.

```json
{
  "providers": {
    "cloudflare": {
      "endpoint": "https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/GATEWAY_ID",
      "api_key": ""  // Optional
    },
    "google-ai-studio": {
      "endpoint": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      "api_key": "",
      "models": {
        "gemini-2.5-flash": "gemini-2.5-flash-preview-04-17",
        "gemini-2.0-flash": "gemini-2.0-flash",
        "gemini-2.0-flash-lite": "gemini-2.0-flash-lite-preview-02-05",
        "learnlm-1.5-pro": "learnlm-1.5-pro-experimental"
      }
    },
    "groq": {
      "endpoint": "https://api.groq.com/openai/v1/chat/completions",
      "api_key": "",
      "models": {
        "qwen-qwq-32b": "qwen-qwq-32b"
      }
    }
  },
  "tasks": {
    "explain": {
      "provider": "google-ai-studio",
      "api_style": "google",
      "model": "gemini-2.0-flash",
      "parameters": {
        "temperature": 0.3
      },
      "prompts": "explain.md"
    },
    "ask": {
      "provider": "google-ai-studio",
      "api_style": "google",
      "cf_aig_mode": true,
      "model": "gemini-2.5-flash",
      "parameters": {
        "temperature": 0.1
      },
      "tools": [
        {
          "googleSearch": {}
        }
      ],
      "max_context": 4,
      "prompts": "You are Gemini, an AI assistant created by Google.",
      "extra": "profile.md"
    }
  }
}
```

### API Styles

The workflow supports two API styles:

1. `google`: Uses Google's Gemini API format
   - Messages are formatted as `contents` with `role` and `parts`
   - Parameters are mapped to Gemini's format (e.g., `temperature`, `maxOutputTokens`)
   - Endpoint path includes model ID and `streamGenerateContent`

2. `openai`: Uses OpenAI-compatible format (default)
   - Messages are formatted as `messages` with `role` and `content`
   - Parameters use OpenAI's format (e.g., `temperature`, `max_tokens`)
   - Endpoint path uses the provider's chat completions endpoint

### Cloudflare AI Gateway

You can route requests through Cloudflare AI Gateway by:

1. Adding a `cloudflare` provider with your gateway endpoint
2. Setting `cf_aig_mode: true` in your task configuration

The workflow will:
- Use the Cloudflare endpoint as the top-level endpoint
- Include the original provider's endpoint and headers in the request
- Add Cloudflare authorization if an API key is provided

Example:
```json
{
  "providers": {
    "cloudflare": {
      "endpoint": "https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/GATEWAY_ID",
      "api_key": "your-cf-ai-gateway-key"  // Optional
    }
  },
  "tasks": {
    "ask": {
      "provider": "google-ai-studio",
      "api_style": "google",
      "cf_aig_mode": true,
      "model": "gemini-2.5-flash"
    }
  }
}
```

## Usage

### Chat

Query LLM via the `ask` keyword, the [Universal Action](https://www.alfredapp.com/help/features/universal-actions/), or the [Fallback Search](https://www.alfredapp.com/help/features/default-results/fallback-searches/).

![Start a chat](images/about/chatkeyword.png)

![Chat text view](images/about/chattextview.png)

- <kbd>↩&#xFE0E;</kbd> Ask a new question.
- <kbd>⌘</kbd><kbd>↩&#xFE0E;</kbd> Continue chat.
- <kbd>⌥</kbd><kbd>↩&#xFE0E;</kbd> Copy last answer.
- <kbd>⌃</kbd><kbd>↩&#xFE0E;</kbd> Copy full chat.
- <kbd>⇧</kbd><kbd>↩&#xFE0E;</kbd> Stop generating answer.

#### Chat History

View Chat History with ⌥↩&#xFE0E; in the `ask` keyword. Each result shows the first question as the title and the last as the subtitle.

![Viewing chat histories](images/about/chathistory.png)

<kbd>↩&#xFE0E;</kbd> to archive the current chat and load the selected one. Older chats can be trashed with the `Delete` [Universal Action](https://www.alfredapp.com/help/features/universal-actions/). Select multiple chats with the [File Buffer](https://www.alfredapp.com/help/features/file-search/#file-buffer).

### La Core Dev Keyword

`lacore` is a development-only, read-only Alfred entry for the v2 La Core
dry-run path. It calls `scripts/la_adapter_harness.js`, which launches
`scripts/la-core-dev.sh`, which runs Deno La Core against `examples/la.v2.json`
and returns Alfred Script Filter JSON.

Selecting a `lacore` command and pressing Enter opens a read-only Text View
preview from `scripts/la_command_preview.js`. The preview calls the adapter
harness in raw `command` mode and formats the dry-run response for the selected
command. Manual preview runs can also opt into the read-only context probe:

```sh
osascript -l JavaScript scripts/la_context_probe.js -- --selection "Hola mundo"
osascript -l JavaScript scripts/la_context_probe.js -- --include-frontmost-app
osascript -l JavaScript scripts/la_command_preview.js -- explain --selection "Hola mundo" --include-frontmost-app
```

The dev-only Universal Action `La Core Preview Selection` accepts text from
Alfred, uses fixed command `explain`, and opens the same read-only dry-run
preview through `scripts/la_selection_preview.js`:

```sh
osascript -l JavaScript scripts/la_selection_preview.js -- "Hola mundo"
```

This entry is parallel to the existing workflow. It does not replace `ask`,
`chat`, `explain`, or `translate`; it does not call providers, stream, execute
tools, collect selected text by simulating keyboard shortcuts, intentionally
write to the clipboard, paste/copy/replace text, write history, or migrate the
real user config. The Universal Action branch does not read clipboard or
frontmost app metadata. Clipboard and frontmost app reads are opt-in manual
preview-only probe actions, and selected text must come from Alfred input,
explicit argv, or development fallbacks. To remove the dev branches, delete the
isolated `lacore` Script Filter object, the `La Core Preview Selection`
Universal Action, their preview Text View objects, connections, and matching
`uidata` entries from `info.plist`.

### Clipboard Safety Notes

La Core and the adapter scripts do not intentionally write to the system
clipboard. `scripts/la_context_probe.js --include-clipboard` can read clipboard
text, but only when explicitly requested. The dev-only Universal Action receives
selected text from Alfred. Alfred's Universal Action selected-text path may
change the system clipboard and/or record the selected text in Alfred Clipboard
History even when La scripts never wrote it. For sensitive text, avoid testing
Universal Action preview unless Alfred clipboard and Clipboard History behavior
is understood or controlled.

To smoke-test the direct La script path:

```sh
scripts/check-clipboard-preservation.sh
```

That helper temporarily writes a sentinel text clipboard value, runs
`scripts/la_selection_preview.js`, verifies the sentinel is still present, and
restores the previous text clipboard when possible. It proves only the direct La
script path; it does not prove Alfred's Universal Action selected-text path is
clipboard-preserving.

### Build Dev Workflow

Build an importable development workflow from this repository:

```sh
scripts/build-dev-workflow.sh
open dist/La-dev.alfredworkflow
```

The package is a separate workflow named `La Dev` with bundle id
`net.placeless.la.dev`, so it should not overwrite an installed production
workflow. Manual Alfred UI testing for `lacore` and `La Core Preview Selection`
should be done against `La Dev`. Deno still needs to be discoverable by
`scripts/la-core-dev.sh` unless a compiled binary is added later.
