import type {
  JsonObject,
  LaConfig,
  ModelRouteConfig,
  ProviderConfig,
} from "../config/types.ts";
import type { ResolvedCommand } from "./command_resolver.ts";
import { LaError } from "./errors.ts";
import type { BuiltPrompt } from "./prompt.ts";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ResolvedModelProviderRoute {
  id: string;
  provider: string;
  apiStyle: string;
  endpoint: string;
  model: string;
  modelAlias: string;
  parameters: JsonObject;
  apiKeyEnv: string | null;
  apiKey: string | null;
  defaultHeaders: Record<string, string>;
}

export interface ModelProviderResponse {
  text: string;
}

export interface ModelProviderDependencies {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      result[key] = item;
    }
  }
  return result;
}

function hasModelRoute(
  route: ModelRouteConfig | null,
): route is ModelRouteConfig {
  return route !== null;
}

export function assertModelCallable(resolved: ResolvedCommand): void {
  if (
    !["quick_ai", "ai_command"].includes(resolved.command.kind) ||
    resolved.command.prompt === null ||
    resolved.command.prompt === undefined ||
    !resolved.modelRouteId ||
    !hasModelRoute(resolved.modelRoute)
  ) {
    throw new LaError(
      "COMMAND_NOT_MODEL_CALLABLE",
      `Command is not model-callable: ${resolved.id}`,
    );
  }
}

function providerConfig(
  config: LaConfig,
  routeId: string,
  route: ModelRouteConfig,
): { id: string; config: ProviderConfig } {
  const providerId = stringValue(route.provider);
  if (!providerId) {
    throw new LaError(
      "MODEL_ROUTE_INVALID",
      `Model route is missing provider: ${routeId}`,
    );
  }

  const provider = config.providers[providerId];
  if (!provider) {
    throw new LaError(
      "MODEL_ROUTE_INVALID",
      `Model route references unknown provider: ${providerId}`,
    );
  }

  return { id: providerId, config: provider };
}

export function resolveModelProviderRoute(
  config: LaConfig,
  resolved: ResolvedCommand,
): ResolvedModelProviderRoute {
  assertModelCallable(resolved);

  const route = resolved.modelRoute;
  if (!route || !resolved.modelRouteId) {
    throw new LaError(
      "COMMAND_NOT_MODEL_CALLABLE",
      `Command is not model-callable: ${resolved.id}`,
    );
  }

  const provider = providerConfig(config, resolved.modelRouteId, route);
  const endpoint = stringValue(provider.config.endpoint);
  if (!endpoint) {
    throw new LaError(
      "MODEL_ROUTE_INVALID",
      `Provider is missing endpoint: ${provider.id}`,
    );
  }

  const modelAlias = stringValue(route.model);
  if (!modelAlias) {
    throw new LaError(
      "MODEL_ROUTE_INVALID",
      `Model route is missing model: ${resolved.modelRouteId}`,
    );
  }

  const model = provider.config.models?.[modelAlias] ?? modelAlias;
  const parameters = isRecord(route.parameters) ? { ...route.parameters } : {};

  return {
    id: resolved.modelRouteId,
    provider: provider.id,
    apiStyle: provider.config.api_style ?? "openai",
    endpoint,
    model,
    modelAlias,
    parameters,
    apiKeyEnv: stringValue(provider.config.api_key_env),
    apiKey: stringValue(provider.config.api_key),
    defaultHeaders: stringRecord(provider.config.default_headers),
  };
}

export function resolveApiKey(
  route: ResolvedModelProviderRoute,
  env: Record<string, string | undefined>,
): string {
  if (route.apiKeyEnv) {
    const value = env[route.apiKeyEnv];
    if (value && value.trim().length > 0) {
      return value;
    }
  }

  if (route.apiKey && route.apiKey.trim().length > 0) {
    return route.apiKey;
  }

  if (route.apiKeyEnv) {
    throw new LaError(
      "MISSING_API_KEY",
      `Missing API key environment variable: ${route.apiKeyEnv}`,
    );
  }

  throw new LaError(
    "MISSING_API_KEY",
    `Provider does not declare an API key environment variable: ${route.provider}`,
  );
}

function truncated(text: string): string {
  return text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
}

function contentToText(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const parts = content
    .map((part) => {
      if (!isRecord(part)) {
        return null;
      }
      return typeof part.text === "string" ? part.text : null;
    })
    .filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join("") : null;
}

function extractOpenAiText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new LaError(
      "MODEL_RESPONSE_INVALID",
      "Model provider response did not include choices.",
    );
  }

  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new LaError(
      "MODEL_RESPONSE_INVALID",
      "Model provider response did not include a message.",
    );
  }

  const text = contentToText(firstChoice.message.content);
  if (text === null) {
    throw new LaError(
      "MODEL_RESPONSE_INVALID",
      "Model provider response message did not include text content.",
    );
  }

  return text;
}

async function callOpenAiCompatible(
  route: ResolvedModelProviderRoute,
  prompt: BuiltPrompt,
  apiKey: string,
  fetchFn: FetchLike,
): Promise<ModelProviderResponse> {
  const body = {
    ...route.parameters,
    model: route.model,
    messages: prompt.messages,
  };

  let response: Response;
  try {
    response = await fetchFn(route.endpoint, {
      method: "POST",
      headers: {
        ...route.defaultHeaders,
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LaError("MODEL_PROVIDER_ERROR", "Model provider request failed", {
      details: message,
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new LaError(
      "MODEL_PROVIDER_HTTP_ERROR",
      `Model provider returned HTTP ${response.status}`,
      {
        details: {
          status: response.status,
          body: truncated(text),
        },
      },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LaError(
      "MODEL_RESPONSE_INVALID",
      "Model provider response was not valid JSON.",
      { details: message },
    );
  }

  return { text: extractOpenAiText(payload) };
}

export async function callModelProvider(
  route: ResolvedModelProviderRoute,
  prompt: BuiltPrompt,
  dependencies: ModelProviderDependencies = {},
): Promise<ModelProviderResponse> {
  const env = dependencies.env ?? Deno.env.toObject();
  const apiKey = resolveApiKey(route, env);
  const fetchFn = dependencies.fetch ?? fetch;

  if (route.apiStyle === "openai") {
    return await callOpenAiCompatible(route, prompt, apiKey, fetchFn);
  }

  throw new LaError(
    "MODEL_PROVIDER_UNSUPPORTED",
    `Unsupported provider API style for real-call mode: ${route.apiStyle}`,
    {
      details: {
        provider: route.provider,
        supported_api_styles: ["openai"],
      },
    },
  );
}
