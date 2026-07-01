import { LaError } from "../core/errors.ts";
import type {
  CommandConfig,
  JsonObject,
  LaConfigV2,
  OutputConfig,
} from "./types.ts";

const BUILT_IN_OUTPUT_MODES = new Set([
  "show",
  "copy",
  "paste",
  "replace_selection",
  "save",
  "open",
]);

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function hasOwn(value: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateTopLevel(config: JsonObject, errors: string[]): void {
  if (config.version !== undefined && config.version !== 2) {
    errors.push("version must be 2 when present");
  }

  for (const key of ["providers", "model_routes", "commands"]) {
    if (!isRecord(config[key])) {
      errors.push(`${key} must exist and be an object`);
    }
  }
}

function outputModeSet(config: JsonObject): Set<string> {
  const modes = isRecord(config.output) && isRecord(config.output.modes)
    ? recordKeys(config.output.modes)
    : [];
  return new Set([...BUILT_IN_OUTPUT_MODES, ...modes]);
}

function toolIdSet(config: JsonObject): Set<string> {
  if (isRecord(config.tools) && isRecord(config.tools.registry)) {
    return new Set(recordKeys(config.tools.registry));
  }
  return new Set();
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string");
}

function validateCommand(
  id: string,
  command: JsonObject,
  config: JsonObject,
  knownOutputModes: Set<string>,
  knownToolIds: Set<string>,
  errors: string[],
): void {
  if (typeof command.kind !== "string" || command.kind.length === 0) {
    errors.push(`commands.${id}.kind must be a non-empty string`);
  }

  if (!hasOwn(command, "prompt")) {
    errors.push(`commands.${id}.prompt must be declared`);
  }

  if (
    command.model_route !== undefined && command.model_route !== null &&
    typeof command.model_route !== "string"
  ) {
    errors.push(`commands.${id}.model_route must be a string or null`);
  } else if (
    typeof command.model_route === "string" &&
    isRecord(config.model_routes) &&
    !hasOwn(config.model_routes, command.model_route)
  ) {
    errors.push(
      `commands.${id}.model_route references unknown route: ${command.model_route}`,
    );
  }

  if (command.tools !== undefined) {
    if (!isStringArray(command.tools)) {
      errors.push(`commands.${id}.tools must be an array of strings`);
    } else {
      for (const toolId of command.tools) {
        if (!knownToolIds.has(toolId)) {
          errors.push(
            `commands.${id}.tools references unknown tool: ${toolId}`,
          );
        }
      }
    }
  }

  if (command.output !== undefined) {
    if (!isRecord(command.output)) {
      errors.push(`commands.${id}.output must be an object`);
    } else {
      const output = command.output as OutputConfig;
      if (output.mode !== undefined && typeof output.mode !== "string") {
        errors.push(`commands.${id}.output.mode must be a string`);
      } else if (
        typeof output.mode === "string" && !knownOutputModes.has(output.mode)
      ) {
        errors.push(
          `commands.${id}.output.mode references unknown mode: ${output.mode}`,
        );
      }
    }
  }
}

function validateModelRoutes(config: JsonObject, errors: string[]): void {
  if (!isRecord(config.model_routes)) {
    return;
  }

  for (const [routeId, route] of Object.entries(config.model_routes)) {
    if (!isRecord(route)) {
      errors.push(`model_routes.${routeId} must be an object`);
      continue;
    }

    if (
      typeof route.provider === "string" && isRecord(config.providers) &&
      !hasOwn(config.providers, route.provider)
    ) {
      errors.push(
        `model_routes.${routeId}.provider references unknown provider: ${route.provider}`,
      );
    }

    if (
      typeof route.gateway === "string" && isRecord(config.gateways) &&
      !hasOwn(config.gateways, route.gateway)
    ) {
      errors.push(
        `model_routes.${routeId}.gateway references unknown gateway: ${route.gateway}`,
      );
    }
  }
}

function validateCommands(config: JsonObject, errors: string[]): void {
  if (!isRecord(config.commands)) {
    return;
  }

  const knownOutputModes = outputModeSet(config);
  const knownToolIds = toolIdSet(config);

  for (const [id, command] of Object.entries(config.commands)) {
    if (!isRecord(command)) {
      errors.push(`commands.${id} must be an object`);
      continue;
    }
    validateCommand(
      id,
      command,
      config,
      knownOutputModes,
      knownToolIds,
      errors,
    );
  }
}

export function validateConfig(value: unknown): LaConfigV2 {
  if (!isRecord(value)) {
    throw new LaError("CONFIG_INVALID", "Config must be a JSON object");
  }

  const errors: string[] = [];
  validateTopLevel(value, errors);
  validateModelRoutes(value, errors);
  validateCommands(value, errors);

  if (errors.length > 0) {
    throw new LaError("CONFIG_INVALID", "Invalid v2 config", {
      details: errors,
    });
  }

  return value as LaConfigV2;
}

export function assertCommandConfig(
  command: unknown,
): asserts command is CommandConfig {
  if (!isRecord(command) || typeof command.kind !== "string") {
    throw new LaError("CONFIG_INVALID", "Invalid command config");
  }
}
