import { loadConfig } from "../src/config/load.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("examples/la.v2.json validates", async () => {
  const loaded = await loadConfig({ configPath: "examples/la.v2.json" });

  assert(loaded.config.version === 2, "expected version 2");
  assert("ask" in loaded.config.commands, "expected ask command");
});
