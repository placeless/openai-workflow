import { loadConfig } from "../src/config/load.ts";
import {
  resolveCommand,
  resolveQuickCommand,
} from "../src/core/command_resolver.ts";
import { LaError } from "../src/core/errors.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("unknown command returns structured error type", async () => {
  const { config } = await loadConfig({ configPath: "examples/la.v2.json" });

  try {
    resolveCommand(config, "missing");
  } catch (error) {
    if (!(error instanceof LaError)) {
      throw new Error("expected LaError");
    }
    assert(error.code === "UNKNOWN_COMMAND", "expected UNKNOWN_COMMAND");
    assert(
      error.message === "Command not found: missing",
      "expected unknown command message",
    );
    return;
  }

  throw new Error("expected unknown command error");
});

Deno.test("quick ai resolves to ask when present", async () => {
  const { config } = await loadConfig({ configPath: "examples/la.v2.json" });
  const resolved = resolveQuickCommand(config);

  assert(resolved.id === "ask", "expected ask command");
  assert(resolved.command.kind === "quick_ai", "expected quick_ai kind");
});

Deno.test("explicit command resolves correctly", async () => {
  const { config } = await loadConfig({ configPath: "examples/la.v2.json" });
  const resolved = resolveCommand(config, "explain");

  assert(resolved.id === "explain", "expected explain command");
  assert(resolved.command.kind === "ai_command", "expected ai_command kind");
});
