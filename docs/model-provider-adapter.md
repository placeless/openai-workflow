# Model Provider Adapter

Batch 11 adds the first real model provider adapter path to La Core. It is
CLI/dev-only and does not change existing Alfred production behavior.

## Runtime Boundary

Dry-run remains the default:

```sh
scripts/la-core-dev.sh quick "hello" --config examples/la.v2.json
scripts/la-core-dev.sh command explain --selection "Hola mundo" --config examples/la.v2.json
```

Real provider calls require the explicit `--no-dry-run` flag:

```sh
scripts/la-core-dev.sh command rewrite --selection "Hola mundo" --config examples/la.v2.json --no-dry-run
```

The dev launcher grants Deno `--allow-net` only when `--no-dry-run` is present.
Default dry-run launches use `--allow-read --allow-env`.

## Provider Scope

The first supported real-call adapter is OpenAI-compatible chat completions.
In `examples/la.v2.json`, the `rewrite` and `translate` commands use the
OpenAI-compatible `cheap` route through the `groq` provider.

API keys come from environment variables such as `api_key_env`, or from existing
config references when present. Secrets must not be hardcoded in example config.

If the required environment variable is missing, La Core returns structured JSON:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_API_KEY",
    "message": "Missing API key environment variable: GROQ_API_KEY"
  }
}
```

Routes using unsupported API styles return structured errors in real-call mode.
Google/Gemini and Cloudflare AI Gateway routing are still future adapter work.

## Prompt Building

Real-call mode builds a minimal chat prompt:

- command prompt from inline config or a prompt file relative to the config file
- message/query
- selection
- clipboard
- frontmost_app
- extra

Commands with `prompt: null`, missing model routes, or non-model kinds such as
`history` are not callable in real-call mode and return
`COMMAND_NOT_MODEL_CALLABLE`.

## Non-Goals

Batch 11 does not:

- change existing Alfred production behavior
- make dev Alfred entries call providers by default
- stream responses
- execute tools
- write history or store data
- handle MCP
- handle embeddings
- copy, paste, replace selection, or mutate clipboard
- fix Alfred Universal Action clipboard behavior
- migrate real user config

The `lacore` Script Filter and `La Core Preview Selection` Universal Action
remain dry-run unless a future batch explicitly changes that wiring.

## Optional Manual Smoke

With a Groq key set:

```sh
GROQ_API_KEY=... scripts/la-core-dev.sh command rewrite --selection "Hola mundo" --config examples/la.v2.json --no-dry-run
```

The command should return:

```json
{
  "ok": true,
  "mode": "model_response",
  "model": {
    "provider": "groq",
    "model": "qwen-qwq-32b"
  },
  "response": {
    "text": "..."
  }
}
```

Do not paste real API keys into logs or docs.
