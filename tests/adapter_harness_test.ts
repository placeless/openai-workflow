function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

interface PreviewContext {
  selection: string | null;
  clipboard: string | null;
  frontmostApp: string | null;
  extra: string | null;
}

interface ParsedPreviewArgs {
  commandId: string;
  context: PreviewContext;
}

interface PreviewModule {
  parsePreviewArgs: (
    argv: string[],
    lookupEnv: (name: string) => string | null,
  ) => ParsedPreviewArgs;
  contextToHarnessArgs: (context: PreviewContext) => string[];
  formatPreview: (payload: unknown) => string;
}

interface ParsedHarnessArgs {
  raw: boolean;
  coreArgs: string[];
  mode: string;
}

interface HarnessModule {
  parseHarnessArgs: (argv: string[]) => ParsedHarnessArgs;
}

async function importJxaModule<T>(
  path: string,
  exportedNames: string[],
): Promise<T> {
  const rawSource = await Deno.readTextFile(path);
  const source = rawSource.replace(/^#!.*\n/, "");
  const moduleSource = [
    "const ObjC = { import() {} };",
    source,
    `export { ${exportedNames.join(", ")} };`,
  ].join("\n");

  const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}`;
  return await import(moduleUrl) as T;
}

Deno.test("adapter harness calls the version-neutral launcher with NSTask", async () => {
  const script = await Deno.readTextFile("scripts/la_adapter_harness.js");

  assert(
    script.includes("scripts/la-core-dev.sh"),
    "expected harness to call the development launcher",
  );
  assert(script.includes("$.NSTask"), "expected NSTask invocation");
  assert(!script.includes("deno run"), "harness should not call deno directly");
});

Deno.test("adapter harness avoids live macOS context and mutation APIs", async () => {
  const script = await Deno.readTextFile("scripts/la_adapter_harness.js");
  const banned = [
    "NSPasteboard",
    "System Events",
    "keystroke",
    "setTheClipboardTo",
    "frontmost = true",
  ];

  for (const token of banned) {
    assert(!script.includes(token), `unexpected live adapter token: ${token}`);
  }
});

Deno.test("command preview stays read-only and uses the adapter harness", async () => {
  const script = await Deno.readTextFile("scripts/la_command_preview.js");

  assert(
    script.includes("scripts/la_adapter_harness.js"),
    "expected preview to call the adapter harness",
  );
  assert(script.includes('"--raw"'), "expected preview to use raw core JSON");
  assert(!script.includes("deno run"), "preview should not call deno directly");

  const banned = [
    "NSPasteboard",
    "System Events",
    "keystroke",
    "setTheClipboardTo",
    "writeToFile",
    "removeItemAtPath",
  ];

  for (const token of banned) {
    assert(
      !script.includes(token),
      `unexpected preview mutation token: ${token}`,
    );
  }
});

Deno.test("adapter harness preserves explicit context flags for raw core calls", async () => {
  const harness = await importJxaModule<HarnessModule>(
    "scripts/la_adapter_harness.js",
    ["parseHarnessArgs"],
  );

  const parsed = harness.parseHarnessArgs([
    "--",
    "--raw",
    "command",
    "explain",
    "--selection",
    "Hola mundo",
    "--extra",
    "A1 learner",
    "--config",
    "examples/la.v2.json",
  ]);

  assert(parsed.raw === true, "expected raw mode");
  assert(parsed.mode === "command", "expected command mode");
  assert(
    JSON.stringify(parsed.coreArgs) === JSON.stringify([
      "command",
      "explain",
      "--selection",
      "Hola mundo",
      "--extra",
      "A1 learner",
      "--config",
      "examples/la.v2.json",
    ]),
    "expected context flags to remain in core argv",
  );
});

Deno.test("command preview forwards explicit simulated context arguments", async () => {
  const preview = await importJxaModule<PreviewModule>(
    "scripts/la_command_preview.js",
    ["parsePreviewArgs", "contextToHarnessArgs"],
  );

  const parsed = preview.parsePreviewArgs([
    "--",
    "explain",
    "--selection",
    "Hola mundo",
    "--frontmost-app",
    "Safari",
    "--extra",
    "A1 learner",
  ], () => null);

  assert(parsed.commandId === "explain", "expected command id");
  assert(
    parsed.context.selection === "Hola mundo",
    "expected explicit selection",
  );
  assert(
    parsed.context.frontmostApp === "Safari",
    "expected explicit frontmost app",
  );
  assert(parsed.context.extra === "A1 learner", "expected explicit extra");
  assert(
    JSON.stringify(preview.contextToHarnessArgs(parsed.context)) ===
      JSON.stringify([
        "--selection",
        "Hola mundo",
        "--frontmost-app",
        "Safari",
        "--extra",
        "A1 learner",
      ]),
    "expected explicit context to become harness flags",
  );
});

Deno.test("command preview renders explicit simulated context", async () => {
  const preview = await importJxaModule<PreviewModule>(
    "scripts/la_command_preview.js",
    ["formatPreview"],
  );

  const text = preview.formatPreview({
    ok: true,
    mode: "dry_run",
    request: {
      entry: "ai_command",
      command: "explain",
      context: {
        query: null,
        selection: "Hola mundo",
        clipboard: null,
        frontmost_app: "Safari",
        extra: "A1 learner",
      },
      model_route: { id: "command" },
      tools: [],
      output: { mode: "show" },
    },
    resolved_command: {
      id: "explain",
      kind: "ai_command",
      tools: [],
      output_mode: "show",
    },
    notes: ["Model API call skipped in dry-run mode."],
  });

  assert(text.includes("Context"), "expected context section");
  assert(
    text.includes("- selection: Hola mundo"),
    "expected selection in preview",
  );
  assert(
    text.includes("- frontmost_app: Safari"),
    "expected frontmost app in preview",
  );
  assert(text.includes("- extra: A1 learner"), "expected extra in preview");
});

Deno.test("command preview argv context overrides simulated environment context", async () => {
  const preview = await importJxaModule<PreviewModule>(
    "scripts/la_command_preview.js",
    ["parsePreviewArgs"],
  );
  const env = new Map([
    ["la_command", "rewrite"],
    ["LA_SIM_SELECTION", "env selection"],
    ["LA_SIM_EXTRA", "env extra"],
  ]);

  const parsed = preview.parsePreviewArgs([
    "--",
    "explain",
    "--selection",
    "argv selection",
  ], (name) => env.get(name) ?? null);

  assert(parsed.commandId === "explain", "expected argv command");
  assert(
    parsed.context.selection === "argv selection",
    "expected argv selection to override environment",
  );
  assert(
    parsed.context.extra === "env extra",
    "expected missing argv context to fall back to environment",
  );
});
