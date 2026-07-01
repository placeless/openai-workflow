import type {
  CommandConfig,
  LaConfigV2,
  ModelRouteConfig,
  OutputConfig,
} from "../config/types.ts";
import { LaError } from "./errors.ts";
import {
  outputRequiresConfirmation,
  resolveOutput,
  resolveToolIds,
  toolsRequireConfirmation,
} from "./output_router.ts";

export interface ResolvedCommand {
  id: string;
  command: CommandConfig;
  modelRouteId: string | null;
  modelRoute: ModelRouteConfig | null;
  tools: string[];
  output: OutputConfig;
  requiresConfirmation: boolean;
}

export interface CommandSummary {
  id: string;
  kind: string;
  title?: string;
  description?: string;
  output_mode?: string;
  requires_confirmation: boolean;
}

export interface ResolvedCommandSummary extends CommandSummary {
  model_route: string | null;
  tools: string[];
}

function resolveDetails(config: LaConfigV2, id: string): ResolvedCommand {
  const command = config.commands[id];
  if (!command) {
    throw new LaError("UNKNOWN_COMMAND", `Command not found: ${id}`);
  }

  const modelRouteId = command.model_route ?? null;
  const modelRoute = modelRouteId ? config.model_routes[modelRouteId] : null;
  const output = resolveOutput(config, command);
  const tools = resolveToolIds(command);
  const requiresConfirmation = command.confirm === true ||
    outputRequiresConfirmation(config, output) ||
    toolsRequireConfirmation(config, tools);

  return {
    id,
    command,
    modelRouteId,
    modelRoute,
    tools,
    output,
    requiresConfirmation,
  };
}

export function resolveCommand(
  config: LaConfigV2,
  id: string,
): ResolvedCommand {
  return resolveDetails(config, id);
}

export function resolveQuickCommand(config: LaConfigV2): ResolvedCommand {
  if (config.commands.ask?.kind === "quick_ai") {
    return resolveDetails(config, "ask");
  }

  const fallback = Object.entries(config.commands).find(([, command]) =>
    command.kind === "quick_ai"
  );

  if (!fallback) {
    throw new LaError("NO_QUICK_COMMAND", "No quick_ai command configured");
  }

  return resolveDetails(config, fallback[0]);
}

export function listCommands(config: LaConfigV2): CommandSummary[] {
  return Object.keys(config.commands).map((id) => {
    const resolved = resolveDetails(config, id);
    return {
      id,
      kind: resolved.command.kind,
      ...(resolved.command.title === undefined
        ? {}
        : { title: resolved.command.title }),
      ...(resolved.command.description === undefined
        ? {}
        : { description: resolved.command.description }),
      ...(resolved.output.mode === undefined
        ? {}
        : { output_mode: resolved.output.mode }),
      requires_confirmation: resolved.requiresConfirmation,
    };
  });
}

export function summarizeResolvedCommand(
  resolved: ResolvedCommand,
): ResolvedCommandSummary {
  return {
    id: resolved.id,
    kind: resolved.command.kind,
    ...(resolved.command.title === undefined
      ? {}
      : { title: resolved.command.title }),
    ...(resolved.command.description === undefined
      ? {}
      : { description: resolved.command.description }),
    ...(resolved.output.mode === undefined
      ? {}
      : { output_mode: resolved.output.mode }),
    requires_confirmation: resolved.requiresConfirmation,
    model_route: resolved.modelRouteId,
    tools: [...resolved.tools],
  };
}
