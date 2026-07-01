import type { PromptConfig } from "../config/types.ts";
import type { NormalizedContext } from "../context/index.ts";
import type { ResolvedCommand } from "./command_resolver.ts";
import { LaError } from "./errors.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BuiltPrompt {
  messages: ChatMessage[];
  source: {
    type: "inline" | "file";
    path?: string;
  };
}

export interface BuildPromptOptions {
  configPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dirname(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  if (index < 0) {
    return ".";
  }
  if (index === 0) {
    return "/";
  }
  return normalized.slice(0, index);
}

function resolvePromptPath(configPath: string, promptPath: string): string {
  if (promptPath.startsWith("/")) {
    return promptPath;
  }
  const base = dirname(configPath);
  return base === "/" ? `/${promptPath}` : `${base}/${promptPath}`;
}

async function loadPromptText(
  configPath: string,
  prompt: PromptConfig,
): Promise<{ text: string; source: BuiltPrompt["source"] }> {
  if (typeof prompt === "string") {
    return { text: prompt, source: { type: "inline" } };
  }

  if (!isRecord(prompt)) {
    throw new LaError(
      "CONFIG_INVALID",
      "Command prompt must be inline or file",
    );
  }

  if (prompt.type === "inline" && typeof prompt.text === "string") {
    return { text: prompt.text, source: { type: "inline" } };
  }

  if (prompt.type === "file" && typeof prompt.path === "string") {
    const path = resolvePromptPath(configPath, prompt.path);
    try {
      return {
        text: await Deno.readTextFile(path),
        source: { type: "file", path },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LaError(
        "PROMPT_LOAD_FAILED",
        `Could not read prompt: ${path}`,
        {
          details: message,
        },
      );
    }
  }

  throw new LaError("CONFIG_INVALID", "Command prompt must be inline or file");
}

function addSection(sections: string[], label: string, value: string | null) {
  if (value === null || value.length === 0) {
    return;
  }
  sections.push(`${label}:\n${value}`);
}

function buildUserContent(context: NormalizedContext): string {
  const sections: string[] = [];

  addSection(sections, "Message", context.query);
  addSection(sections, "Selection", context.selection);
  addSection(sections, "Clipboard", context.clipboard);
  addSection(sections, "Frontmost app", context.frontmost_app);
  addSection(sections, "Extra", context.extra);

  if (sections.length === 0) {
    return "No message or explicit context was provided.";
  }

  return sections.join("\n\n");
}

export async function buildModelPrompt(
  resolved: ResolvedCommand,
  context: NormalizedContext,
  options: BuildPromptOptions,
): Promise<BuiltPrompt> {
  const prompt = resolved.command.prompt;
  if (prompt === null || prompt === undefined) {
    throw new LaError(
      "COMMAND_NOT_MODEL_CALLABLE",
      `Command is not model-callable: ${resolved.id}`,
    );
  }

  const { text, source } = await loadPromptText(options.configPath, prompt);

  return {
    messages: [
      { role: "system", content: text },
      { role: "user", content: buildUserContent(context) },
    ],
    source,
  };
}
