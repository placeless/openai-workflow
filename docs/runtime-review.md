# Runtime Review

Batch 2.5 reviews the v2 runtime direction before any La Core implementation. It is documentation-only and does not change Alfred workflow behavior.

## Executive Summary

La v2 Core should use Deno + TypeScript by default, with JXA kept as a thin Alfred/macOS adapter. This gives the project a maintainable typed core, built-in validation/test tooling, first-class HTTP streaming, a permission model that maps well to La's tool risk model, and a path to a future compiled helper.

Do not rewrite the Alfred workflow graph in Batch 3. Batch 3 should introduce a small Deno CLI skeleton, `deno.json`, and core module boundaries that can be exercised outside Alfred. Existing JXA scripts should keep current behavior until a later adapter batch switches call sites deliberately.

## Current Runtime Responsibilities

Current behavior is split between `info.plist` and JXA scripts:

- `info.plist` owns Alfred entry points, modifiers, external triggers, Text View wiring, variable passing, clipboard output, and stream interruption scripts.
- `scripts/resolve_config.js` reads v1 config, resolves `task` to provider/model/prompt settings, expands prompt files, and emits the `recipe` variable.
- `scripts/llm.js` owns chat storage, prompt/message formatting, provider strategy selection, curl command construction, streaming state, response parsing, stall detection, and Text View JSON output.
- `scripts/save_history.js`, `scripts/load_history.js`, `scripts/copy_last.js`, and `scripts/copy_all.js` read or move local chat JSON files.
- `scripts/check_config.js` validates the current v1 config shape and renders results in Text View.

This works, but `scripts/llm.js` is already carrying config, model, streaming, storage, provider, and UI-response responsibilities in one JXA entry point.

## Options Considered

| Option | Fit | Tradeoffs |
| --- | --- | --- |
| Keep core in JXA | Best macOS and Alfred integration; no new runtime dependency. | Weak module/test ergonomics, awkward streaming HTTP, limited validation tooling, and rising long-term complexity as tools/store/model routes grow. |
| Node.js + JavaScript/ESM | Mature ecosystem, strong HTTP/streaming support, familiar tests, easy JSON handling. | Requires Node unless bundled, tends toward `node_modules`, dependency drift, and weaker default permission boundaries. |
| Deno + TypeScript | TypeScript-first, built-in `fetch`, `fmt`, `lint`, `test`, `check`, no `node_modules` by default, explicit permissions, future `deno compile`. | Deno must be installed during development unless a binary is bundled; compiled binaries add size and release workflow complexity; Alfred environment/path handling needs care. |
| Swift or native helper | Best native APIs, fast startup, good packaging potential. | Premature for provider adapters, streaming protocols, schema evolution, and command/tool iteration. Development velocity would drop before the architecture is settled. |
| Hybrid | Keeps JXA for Alfred/macOS edges and moves portable core logic to Deno. | Requires a clear adapter contract and temporary duplication while migration is staged. |

## Recommendation

Use the hybrid path: JXA thin adapter + Deno TypeScript core.

Answering the key questions:

1. Yes, La v2 Core should use Deno + TypeScript by default.
2. Yes, JXA should remain the Alfred/macOS adapter layer for selected text, clipboard, frontmost app, paste/replace selection, Alfred variables, and Alfred JSON responses.
3. Yes, Batch 3 should implement `bin/la.ts` and `src/**/*.ts`, not `bin/la.mjs` and `src/**/*.mjs`.
4. Yes, Batch 3 should add `deno.json`.
5. Yes, avoid npm dependencies by default.
6. Yes, design for future `deno compile`, but do not require compiled binaries immediately.
7. Future CLI permissions should be narrow and command-dependent: read/env by default for config checks, net only for model calls, write only for store mutations, run only for confirmed dangerous tools.
8. During development, Alfred should eventually call `deno run` through a small resolver/wrapper that finds Deno reliably in the Alfred environment.
9. After packaging, Alfred should call a bundled compiled helper when available, falling back to documented Deno execution for development builds.
10. Deno risks remain around user installation, binary size, permission flag complexity, path resolution from Alfred, and ensuring compiled behavior matches development behavior.

## Why Deno

Deno matches the v2 config and tool direction better than continuing to grow JXA:

- TypeScript makes config schema, command resolution, model routing, tool risk classes, and store paths easier to model safely.
- Built-in `fetch`, streams, `ReadableStream`, and web APIs are a better fit for model adapters than spawning `/usr/bin/curl`.
- Built-in `deno check`, `deno test`, `deno fmt`, and `deno lint` keep Batch 3 lightweight without adding a dependency manager.
- The permission model maps directly to La's proposed tool risks.
- No `node_modules` by default keeps the workflow repo smaller and easier to package.
- `deno compile` offers a future path to a bundled helper for users who should not need to install Deno.

## Why Not Pure JXA

Pure JXA should not be the v2 core path. It remains valuable for Alfred and macOS integration, but it is a poor fit for a growing portable core:

- Testing individual modules is harder than TypeScript modules.
- HTTP streaming currently depends on curl process management and temp files.
- Config validation and migration logic will become verbose.
- Provider adapters, tool policy, history search, and store caches would make `scripts/llm.js` more difficult to maintain.
- JXA should stay close to the UI and OS boundary where it is strongest.

## Why Not Node First

Node would work technically, but it is not the best default for this repo:

- It creates stronger pressure to add npm packages and `node_modules`.
- It lacks Deno's built-in permission model, which is useful for explicit tool boundaries.
- Packaging a reliable Alfred workflow with Node has similar dependency questions without the same no-dependency default.
- TypeScript setup usually needs more project machinery than Deno for the same initial core.

Node compatibility should remain possible for isolated libraries if needed later, but the default v2 core should not start there.

## Why Not Swift Yet

Swift may be useful later for native macOS actions, but it is premature as the primary core:

- The config, command, model adapter, and store boundaries are still moving.
- LLM HTTP streaming and provider payload iteration are faster in TypeScript.
- Swift packaging and signing would add release complexity before user-facing behavior needs it.
- A later Swift helper can be added for specific native operations if JXA becomes limiting.

## Hybrid Boundary

Recommended boundary:

```text
Alfred / JXA adapter
  - selected text
  - clipboard
  - frontmost app
  - paste / replace selection
  - Alfred-specific JSON and variables

Deno + TypeScript La Core
  - config loading and validation
  - command resolution
  - request normalization
  - prompt building
  - model routing
  - streaming
  - local store
  - tool registry
  - history search
```

Future shape:

```text
bin/
  la.ts

src/
  core/
  config/
  context/
  model/
  commands/
  tools/
  store/
  alfred/

deno.json
```

`src/alfred/` should contain serialization helpers and adapter contracts, not direct workflow graph ownership. `info.plist` should remain the Alfred routing source until a later batch intentionally changes it.

## Development Workflow

Future `deno.json` tasks:

```bash
deno task check
deno task test
deno task fmt
deno task lint
deno task quick --config examples/la.v2.json "hello"
```

Future direct CLI commands:

```bash
deno run --allow-read --allow-env bin/la.ts config-check --config examples/la.v2.json
deno run --allow-read --allow-env bin/la.ts commands --config examples/la.v2.json
deno run --allow-read --allow-env --allow-net bin/la.ts quick "hello" --config examples/la.v2.json
deno run --allow-read --allow-env --allow-net bin/la.ts command explain --selection "Hola mundo" --config examples/la.v2.json
```

Alfred development calls should use a wrapper or resolver that first finds a local bundled helper, then `LA_DENO_BIN`, then `deno` from the current environment, then login-shell PATH. This avoids making Alfred users debug PATH issues manually.

## Packaging / Distribution Strategy

Recommended staged path:

1. Batch 3 adds Deno source and `deno.json`, with no Alfred behavior switch.
2. Add tests and config validation against `examples/la.v2.json`.
3. Add an Alfred adapter command that can call the Deno CLI in development.
4. Package a compiled helper only after the CLI contract is stable.
5. Prefer a bundled helper for released workflow builds, with source Deno execution documented for contributors.

Future compiled helper names should avoid colliding with the repo name; for example `bin/la-core` for packaged builds and `bin/la.ts` for source execution.

## Permission Model

The Deno permission model maps well to La's tool risk model:

| La risk | Deno permissions | Notes |
| --- | --- | --- |
| `read` | `--allow-read`, `--allow-env` | Config, prompts, workflow data, selected files, and API key env vars. |
| `network` | `--allow-net` | Model providers, Cloudflare AI Gateway, and explicitly allowed network tools. |
| `write` | `--allow-write` | History archive, event logs, summaries, and rebuildable indexes. |
| `dangerous` | `--allow-run` plus confirmation | Shell tools or arbitrary external commands. Not part of default model calls. |

Default commands should not request `--allow-run`. Network permissions should be scoped to provider and gateway hosts where practical. Write permissions should be scoped to Alfred workflow data/cache paths.

## Impact on Batch 3

Batch 3 should:

- add `deno.json`
- add `bin/la.ts`
- add `src/**/*.ts` module skeletons
- implement config loading and validation first
- include tests for `examples/la.v2.json`
- keep existing JXA and Alfred behavior unchanged
- avoid npm dependencies
- avoid model API calls unless explicitly scoped to a later batch

Batch 3 should not:

- switch `info.plist` to call Deno
- replace `scripts/llm.js`
- migrate user config
- implement tools, MCP, embeddings, or compiled packaging

## Risks

- Alfred may not inherit a PATH that can find Deno.
- Users should not need to install Deno for stable packaged releases.
- `deno compile` may produce binaries that are large relative to the current workflow.
- Permission flags can become confusing if command risk classes are not mapped clearly.
- Network streaming behavior must be tested against Google, OpenAI-compatible providers, and Cloudflare AI Gateway.
- A hybrid period can create duplicate config-resolution paths unless adapter contracts stay narrow.

## Open Questions

- Should the first Deno implementation validate v2 only, or also read v1 for migration checks?
- Should provider host allowlists be generated from config at runtime?
- Should packaged builds include one universal binary or separate architecture-specific helpers?
- How much Alfred Text View response formatting should move into `src/alfred/` versus stay in JXA?
- Should history search start as plain file scanning before any rebuildable index exists?
