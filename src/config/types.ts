export type JsonObject = Record<string, unknown>;

export type PromptConfig = string | JsonObject | null;

export interface ProviderConfig extends JsonObject {
  api_style?: string;
  endpoint?: string;
  models?: Record<string, string>;
}

export interface ModelRouteConfig extends JsonObject {
  provider?: string;
  model?: string;
  gateway?: string;
  parameters?: JsonObject;
  description?: string;
}

export interface OutputConfig extends JsonObject {
  mode?: string;
  requires_confirmation?: boolean;
}

export interface CommandConfig extends JsonObject {
  kind: string;
  title?: string;
  description?: string;
  prompt?: PromptConfig;
  model_route?: string | null;
  tools?: string[];
  output?: OutputConfig;
  confirm?: boolean;
  history?: boolean;
}

export interface ToolConfig extends JsonObject {
  requires_confirmation?: boolean;
  risk?: string;
}

export interface ToolsConfig extends JsonObject {
  defaults?: string[];
  registry?: Record<string, ToolConfig>;
}

export interface OutputRegistry extends JsonObject {
  default?: OutputConfig;
  modes?: Record<string, OutputConfig>;
}

export interface LaConfig extends JsonObject {
  version?: number;
  providers: Record<string, ProviderConfig>;
  gateways?: Record<string, JsonObject>;
  model_routes: Record<string, ModelRouteConfig>;
  commands: Record<string, CommandConfig>;
  tools?: ToolsConfig;
  output?: OutputRegistry;
}
