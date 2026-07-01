import type {
  LaConfig,
  ModelRouteConfig,
  OutputConfig,
} from "../config/types.ts";
import type { CliContextInput, NormalizedContext } from "../context/index.ts";
import { normalizeCliContext } from "../context/index.ts";
import type { ResolvedCommand } from "./command_resolver.ts";

export interface DryRunRequest {
  entry: string;
  command: string;
  message: string | null;
  context: NormalizedContext;
  model_route: ({ id: string } & ModelRouteConfig) | Record<string, never>;
  tools: string[];
  output: OutputConfig;
  dry_run: true;
}

export interface ModelRunRequest {
  entry: string;
  command: string;
  message: string | null;
  context: NormalizedContext;
  model_route: ({ id: string } & ModelRouteConfig) | Record<string, never>;
  tools: string[];
  output: OutputConfig;
  dry_run: false;
}

function buildBaseRequest(
  resolved: ResolvedCommand,
  input: CliContextInput,
): Omit<DryRunRequest, "dry_run"> {
  const context = normalizeCliContext(input);
  const modelRoute = resolved.modelRouteId && resolved.modelRoute
    ? { id: resolved.modelRouteId, ...resolved.modelRoute }
    : {};

  return {
    entry: resolved.command.kind,
    command: resolved.id,
    message: context.query,
    context,
    model_route: modelRoute,
    tools: [...resolved.tools],
    output: { ...resolved.output },
  };
}

export function buildDryRunRequest(
  _config: LaConfig,
  resolved: ResolvedCommand,
  input: CliContextInput,
): DryRunRequest {
  return {
    ...buildBaseRequest(resolved, input),
    dry_run: true,
  };
}

export function buildModelRunRequest(
  _config: LaConfig,
  resolved: ResolvedCommand,
  input: CliContextInput,
): ModelRunRequest {
  return {
    ...buildBaseRequest(resolved, input),
    dry_run: false,
  };
}
