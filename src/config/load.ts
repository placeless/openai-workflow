import { LaError } from "../core/errors.ts";
import type { LaConfigV2 } from "./types.ts";
import { validateConfig } from "./validate.ts";

export const DEFAULT_CONFIG_PATH = "examples/la.v2.json";

export interface LoadConfigOptions {
  configPath?: string;
  env?: Record<string, string | undefined>;
}

export interface LoadedConfig {
  path: string;
  config: LaConfigV2;
}

export function resolveConfigPath(
  configPath?: string,
  env: Record<string, string | undefined> = Deno.env.toObject(),
): string {
  return configPath ?? env.LA_CONFIG ?? DEFAULT_CONFIG_PATH;
}

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<LoadedConfig> {
  const path = resolveConfigPath(options.configPath, options.env);

  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LaError("CONFIG_LOAD_FAILED", `Could not read config: ${path}`, {
      details: message,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LaError(
      "CONFIG_LOAD_FAILED",
      `Config is not strict JSON: ${path}`,
      {
        details: message,
      },
    );
  }

  return {
    path,
    config: validateConfig(parsed),
  };
}
