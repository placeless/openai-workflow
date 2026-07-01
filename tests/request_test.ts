import { loadConfig } from "../src/config/load.ts";
import { resolveCommand } from "../src/core/command_resolver.ts";
import { buildDryRunRequest } from "../src/core/request.ts";

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
