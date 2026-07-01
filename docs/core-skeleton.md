# Deno Core Skeleton

Batch 3 adds a minimal Deno + TypeScript La Core skeleton. It is a command-line
dry-run runtime only; Alfred still uses the existing `info.plist` workflow graph
and JXA scripts.

The skeleton validates v2 config files, resolves configured commands, builds
normalized request objects, and prints structured JSON. It does not call model
APIs, stream responses, run tools, read the real clipboard, inspect the
frontmost app, migrate v1 config, or change Alfred behavior.

## Commands

Run the CLI directly during development:

```sh
deno run --allow-read --allow-env bin/la.ts config-check --config examples/la.v2.json
deno run --allow-read --allow-env bin/la.ts commands --config examples/la.v2.json
deno run --allow-read --allow-env bin/la.ts quick "hello" --config examples/la.v2.json
deno run --allow-read --allow-env bin/la.ts command explain --selection "Hola mundo" --config examples/la.v2.json
```

Config lookup order is:

1. `--config <path>`
2. `LA_CONFIG`
3. `examples/la.v2.json`

`quick` resolves command id `ask` first, then falls back to the first command
whose kind is `quick_ai`. `command <id>` resolves an explicit command id.

## Validation Scope

Batch 3 validates v2 config shape only. It checks the top-level v2 objects,
command `kind` and declared `prompt`, command model route references, command
tool references, and output modes. It intentionally does not implement v1
migration checks or a full JSON Schema validator.

## Deno Tasks

Useful tasks:

```sh
deno task check
deno task fmt
deno task lint
deno task test
deno task config-check
deno task commands
deno task quick "hello"
```

The `quick` task passes extra arguments to `bin/la.ts`, so
`deno task quick "hello"` runs the same dry-run path as the direct CLI command.

## Batch 4 Launcher

Batch 4 adds `scripts/la-core-dev.sh` as a development-only launcher around this
CLI. The launcher is not wired into Alfred. It prefers a future compiled core
binary when present, otherwise resolves Deno and runs:

```sh
deno run --allow-read --allow-env bin/la.ts ...
```

The Alfred adapter contract for future wiring is documented in
`docs/alfred-adapter-v2.md`.
