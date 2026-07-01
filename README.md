# La 🌶️ - An LLM Alfred Workflow

## Setup

Please create a configuration file, such as `~/.config/alfred/la.json`, tailored to your specific needs. This configuration file should be structured into two main sections: `providers` for your Large Language Model (LLM) providers and `tasks` for the tasks you want the LLMs to perform.

See [docs/architecture.md](docs/architecture.md) for the current workflow architecture and v2 refactor boundaries. The proposed v2 configuration model is documented in [docs/config-v2.md](docs/config-v2.md), with migration notes in [docs/migration-config-v1-to-v2.md](docs/migration-config-v1-to-v2.md), runtime direction in [docs/runtime-review.md](docs/runtime-review.md), the dry-run Deno skeleton in [docs/core-skeleton.md](docs/core-skeleton.md), and the future Alfred adapter contract in [docs/alfred-adapter-v2.md](docs/alfred-adapter-v2.md).

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
