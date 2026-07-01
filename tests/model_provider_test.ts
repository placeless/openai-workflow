import { loadConfig } from "../src/config/load.ts";
import { resolveCommand } from "../src/core/command_resolver.ts";
import {
  callModelProvider,
  resolveModelProviderRoute,
} from "../src/core/model_provider.ts";
import { buildModelPrompt } from "../src/core/prompt.ts";
import { buildModelRunRequest } from "../src/core/request.ts";
import { LaError } from "../src/core/errors.ts";
import { run } from "../src/core/run.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("provider route resolves openai-compatible example route", async () => {
  const { config } = await loadConfig({ configPath: "examples/la.v2.json" });
  const resolved = resolveCommand(config, "rewrite");
  const route = resolveModelProviderRoute(config, resolved);

  assert(route.id === "cheap", "expected cheap route");
  assert(route.provider === "groq", "expected groq provider");
  assert(route.apiStyle === "openai", "expected openai API style");
  assert(route.model === "qwen-qwq-32b", "expected concrete model");
  assert(route.apiKeyEnv === "GROQ_API_KEY", "expected key env");
});

Deno.test("missing provider API key returns structured error type", async () => {
  const { config } = await loadConfig({ configPath: "examples/la.v2.json" });
  const resolved = resolveCommand(config, "rewrite");
  const route = resolveModelProviderRoute(config, resolved);
  const request = buildModelRunRequest(config, resolved, {
    selection: "Hola mundo",
  });
  const prompt = await buildModelPrompt(resolved, request.context, {
    configPath: "examples/la.v2.json",
  });

  try {
    await callModelProvider(route, prompt, {
      env: {},
      fetch: () => {
        throw new Error("fetch should not run without an API key");
      },
    });
  } catch (error) {
    if (!(error instanceof LaError)) {
      throw new Error("expected LaError");
    }
    assert(error.code === "MISSING_API_KEY", "expected MISSING_API_KEY");
    assert(
      error.message === "Missing API key environment variable: GROQ_API_KEY",
      "expected missing key message",
    );
    return;
  }

  throw new Error("expected missing key error");
});

Deno.test("real-call mode can use injected fetch without network permission", async () => {
  const payload = await run([
    "command",
    "rewrite",
    "--selection",
    "Hola mundo",
    "--config",
    "examples/la.v2.json",
    "--no-dry-run",
  ], {
    env: { GROQ_API_KEY: "test-key" },
    fetch: (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        model?: string;
        messages?: Array<{ role: string; content: string }>;
      };
      assert(body.model === "qwen-qwq-32b", "expected request model");
      assert(Array.isArray(body.messages), "expected messages");
      assert(
        body.messages?.[1]?.content.includes("Selection:\nHola mundo") ===
          true,
        "expected selection in prompt",
      );

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Mock response" } }],
          }),
          { status: 200 },
        ),
      );
    },
  }) as {
    mode: string;
    model: { provider: string; model: string };
    response: { text: string };
  };

  assert(payload.mode === "model_response", "expected model response mode");
  assert(payload.model.provider === "groq", "expected provider");
  assert(payload.response.text === "Mock response", "expected mock text");
});
