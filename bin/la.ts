#!/usr/bin/env -S deno run --allow-read --allow-env

import { main } from "../src/core/run.ts";

if (import.meta.main) {
  const exitCode = await main(Deno.args);
  Deno.exit(exitCode);
}
