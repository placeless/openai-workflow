import { loadConfig } from "../src/config/load.ts";
import { resolveCommand } from "../src/core/command_resolver.ts";
import { buildModelPrompt } from "../src/core/prompt.ts";
import { buildModelRunRequest } from "../src/core/request.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("prompt builder loads file prompt and includes selection", async () => {
  const { config } = await loadConfig({ configPath: "examples/la.v2.json" });
  const resolved = resolveCommand(config, "explain");
  const request = buildModelRunRequest(config, resolved, {
    selection: "Hola mundo",
  });
  const prompt = await buildModelPrompt(resolved, request.context, {
    configPath: "examples/la.v2.json",
  });

  assert(prompt.source.type === "file", "expected file prompt source");
  assert(
    prompt.source.path === "examples/prompts/explain.md",
    "expected prompt path relative to config",
  );
  assert(prompt.messages[0].role === "system", "expected system prompt");
  assert(
    prompt.messages[0].content.includes("Explain the input clearly."),
    "expected file prompt text",
  );
  assert(prompt.messages[1].role === "user", "expected user message");
  assert(
    prompt.messages[1].content.includes("Selection:\nHola mundo"),
    "expected selection in user content",
  );
});
