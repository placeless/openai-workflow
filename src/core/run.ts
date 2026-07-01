import { loadConfig } from "../config/load.ts";
import type { LoadedConfig } from "../config/load.ts";
import {
  callModelProvider,
  type FetchLike,
  resolveModelProviderRoute,
} from "./model_provider.ts";
import { buildModelPrompt } from "./prompt.ts";
import { buildDryRunRequest, buildModelRunRequest } from "./request.ts";
import {
  listCommands,
  resolveCommand,
  resolveQuickCommand,
  summarizeResolvedCommand,
} from "./command_resolver.ts";
import { exitCodeFor, LaError, toErrorPayload } from "./errors.ts";

interface ParsedArgs {
  positionals: string[];
  options: {
    config?: string;
    noDryRun?: boolean;
    selection?: string;
    clipboard?: string;
    frontmostApp?: string;
    extra?: string;
  };
}

interface ConfigCheckOutput {
  ok: true;
  mode: "config_check";
  config_path: string;
  version: number;
}

interface RunOptions {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: ParsedArgs["options"] = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    if (arg === "--no-dry-run") {
      options.noDryRun = true;
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new LaError("CLI_USAGE", `Missing value for ${arg}`);
    }
    index += 1;

    switch (arg) {
      case "--config":
        options.config = value;
        break;
      case "--selection":
        options.selection = value;
        break;
      case "--clipboard":
        options.clipboard = value;
        break;
      case "--frontmost-app":
        options.frontmostApp = value;
        break;
      case "--extra":
        options.extra = value;
        break;
      default:
        throw new LaError("CLI_USAGE", `Unknown option: ${arg}`);
    }
  }

  return { positionals, options };
}

async function loadFromArgs(
  parsed: ParsedArgs,
  options: RunOptions,
): Promise<LoadedConfig> {
  return await loadConfig({
    configPath: parsed.options.config,
    env: options.env,
  });
}

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function configCheckOutput(loaded: LoadedConfig): ConfigCheckOutput {
  return {
    ok: true,
    mode: "config_check",
    config_path: loaded.path,
    version: loaded.config.version ?? 2,
  };
}

function buildNotes(): string[] {
  return ["Model API call skipped in dry-run mode."];
}

async function runParsed(
  parsed: ParsedArgs,
  options: RunOptions,
): Promise<unknown> {
  const [mode, ...rest] = parsed.positionals;
  if (!mode) {
    throw new LaError("CLI_USAGE", "Missing command");
  }

  const loaded = await loadFromArgs(parsed, options);

  switch (mode) {
    case "config-check":
      return configCheckOutput(loaded);
    case "commands":
      return {
        ok: true,
        mode: "commands",
        config_path: loaded.path,
        commands: listCommands(loaded.config),
      };
    case "quick": {
      const query = rest.join(" ").trim();
      if (!query) {
        throw new LaError("CLI_USAGE", "quick requires a message");
      }
      const resolved = resolveQuickCommand(loaded.config);
      const input = {
        query,
        selection: parsed.options.selection,
        clipboard: parsed.options.clipboard,
        frontmostApp: parsed.options.frontmostApp,
        extra: parsed.options.extra,
      };
      if (parsed.options.noDryRun) {
        return await runModelCall(loaded, resolved, input, options);
      }
      const request = buildDryRunRequest(loaded.config, resolved, {
        ...input,
      });
      return {
        ok: true,
        mode: "dry_run",
        request,
        resolved_command: summarizeResolvedCommand(resolved),
        notes: buildNotes(),
      };
    }
    case "command": {
      const [commandId, ...messageParts] = rest;
      if (!commandId) {
        throw new LaError("CLI_USAGE", "command requires a command id");
      }
      const resolved = resolveCommand(loaded.config, commandId);
      const query = messageParts.join(" ").trim() || null;
      const input = {
        query,
        selection: parsed.options.selection,
        clipboard: parsed.options.clipboard,
        frontmostApp: parsed.options.frontmostApp,
        extra: parsed.options.extra,
      };
      if (parsed.options.noDryRun) {
        return await runModelCall(loaded, resolved, input, options);
      }
      const request = buildDryRunRequest(loaded.config, resolved, input);
      return {
        ok: true,
        mode: "dry_run",
        request,
        resolved_command: summarizeResolvedCommand(resolved),
        notes: buildNotes(),
      };
    }
    default:
      throw new LaError("CLI_USAGE", `Unknown command: ${mode}`);
  }
}

async function runModelCall(
  loaded: LoadedConfig,
  resolved: ReturnType<typeof resolveCommand>,
  input: Parameters<typeof buildModelRunRequest>[2],
  options: RunOptions,
): Promise<unknown> {
  const request = buildModelRunRequest(loaded.config, resolved, input);
  const route = resolveModelProviderRoute(loaded.config, resolved);
  const prompt = await buildModelPrompt(resolved, request.context, {
    configPath: loaded.path,
  });
  const response = await callModelProvider(route, prompt, {
    env: options.env,
    fetch: options.fetch,
  });

  return {
    ok: true,
    mode: "model_response",
    request,
    resolved_command: summarizeResolvedCommand(resolved),
    model: {
      provider: route.provider,
      model: route.model,
    },
    response,
  };
}

export async function run(
  args: string[],
  options: RunOptions = {},
): Promise<unknown> {
  return await runParsed(parseArgs(args), options);
}

export async function main(args: string[]): Promise<number> {
  try {
    printJson(await run(args));
    return 0;
  } catch (error) {
    printJson(toErrorPayload(error));
    return exitCodeFor(error);
  }
}
