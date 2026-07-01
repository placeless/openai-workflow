import type {
  CommandConfig,
  LaConfigV2,
  OutputConfig,
  ToolConfig,
} from "../config/types.ts";

const FALLBACK_OUTPUT: OutputConfig = { mode: "show" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveOutput(
  config: LaConfigV2,
  command: CommandConfig,
): OutputConfig {
  if (isRecord(command.output)) {
    return { ...command.output };
  }

  if (isRecord(config.output?.default)) {
    return { ...config.output.default };
  }

  return { ...FALLBACK_OUTPUT };
}

export function outputRequiresConfirmation(
  config: LaConfigV2,
  output: OutputConfig,
): boolean {
  const mode = output.mode;
  if (!mode) {
    return false;
  }
  const modeConfig = config.output?.modes?.[mode];
  return modeConfig?.requires_confirmation === true;
}

export function resolveToolIds(command: CommandConfig): string[] {
  return Array.isArray(command.tools) ? [...command.tools] : [];
}

export function toolsRequireConfirmation(
  config: LaConfigV2,
  toolIds: string[],
): boolean {
  const registry = config.tools?.registry ?? {};
  return toolIds.some((toolId) => {
    const tool: ToolConfig | undefined = registry[toolId];
    return tool?.requires_confirmation === true || tool?.risk === "dangerous";
  });
}
