import { loadConfig } from "../src/config/load.ts";
import { resolveCommand } from "../src/core/command_resolver.ts";
import { LaError } from "../src/core/errors.ts";
import { buildDryRunRequest } from "../src/core/request.ts";
import { run } from "../src/core/run.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("request object includes explicit selection", async () => {
  const { config } = await loadConfig({ configPath: "examples/la.v2.json" });
  const resolved = resolveCommand(config, "explain");
  const request = buildDryRunRequest(config, resolved, {
    selection: "Hola mundo",
  });

  assert(request.command === "explain", "expected explain command");
  assert(request.context.selection === "Hola mundo", "expected selection");
  assert(request.context.clipboard === null, "clipboard should stay null");
  assert(request.dry_run === true, "expected dry run request");
});

Deno.test("core dry-run preserves explicit simulated context", async () => {
  const payload = await run([
    "command",
    "explain",
    "--selection",
    "Hola mundo",
    "--frontmost-app",
    "Safari",
    "--extra",
    "A1 learner",
    "--config",
    "examples/la.v2.json",
  ]);
  const result = payload as {
    mode: string;
    request: {
      context: {
        selection: string | null;
        clipboard: string | null;
        frontmost_app: string | null;
        extra: string | null;
      };
    };
  };

  assert(result.mode === "dry_run", "expected dry-run payload");
  assert(
    result.request.context.selection === "Hola mundo",
    "expected selection",
  );
  assert(
    result.request.context.frontmost_app === "Safari",
    "expected frontmost app",
  );
  assert(result.request.context.extra === "A1 learner", "expected extra");
  assert(result.request.context.clipboard === null, "clipboard should be null");
});

Deno.test("dry-run remains the default without explicit real-call flag", async () => {
  const payload = await run([
    "quick",
    "hello",
    "--config",
    "examples/la.v2.json",
  ], { env: {} }) as {
    mode: string;
    notes: string[];
  };

  assert(payload.mode === "dry_run", "expected dry-run payload");
  assert(
    payload.notes.includes("Model API call skipped in dry-run mode."),
    "expected dry-run note",
  );
});

Deno.test("non-model-callable command errors in real-call mode", async () => {
  try {
    await run([
      "command",
      "history_search",
      "hello",
      "--config",
      "examples/la.v2.json",
      "--no-dry-run",
    ], { env: {} });
  } catch (error) {
    if (!(error instanceof LaError)) {
      throw new Error("expected LaError");
    }
    assert(
      error.code === "COMMAND_NOT_MODEL_CALLABLE",
      "expected non-callable command error",
    );
    assert(
      error.message === "Command is not model-callable: history_search",
      "expected non-callable command message",
    );
    return;
  }

  throw new Error("expected non-callable command error");
});
