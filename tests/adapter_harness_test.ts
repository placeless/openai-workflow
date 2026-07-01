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
  explicitContext: Record<string, boolean | undefined>;
  probe: {
    includeClipboard: boolean;
    includeFrontmostApp: boolean;
    maxClipboardChars: number;
  };
}

interface PreviewModule {
  parsePreviewArgs: (
    argv: string[],
    lookupEnv: (name: string) => string | null,
  ) => ParsedPreviewArgs;
  contextToHarnessArgs: (context: PreviewContext) => string[];
  contextProbeArgs: (parsed: ParsedPreviewArgs) => string[];
  applyProbeContext: (parsed: ParsedPreviewArgs, payload: unknown) => void;
  probeAdapterNotes: (payload: unknown) => string[];
  formatPreview: (payload: unknown, adapterNotes?: string[]) => string;
}

interface ParsedHarnessArgs {
  raw: boolean;
  coreArgs: string[];
  mode: string;
}

interface HarnessModule {
  parseHarnessArgs: (argv: string[]) => ParsedHarnessArgs;
}

interface ClipboardProbeContext {
  text: string | null;
  available: boolean;
  truncated: boolean;
}

interface ParsedProbeArgs {
  selection: string | null;
  includeClipboard: boolean;
  includeFrontmostApp: boolean;
  maxClipboardChars: number;
}

interface ContextProbeModule {
  parseProbeArgs: (argv: string[]) => ParsedProbeArgs;
  normalizeClipboardText: (
    value: string | null,
    maxChars: number,
  ) => ClipboardProbeContext;
}

interface SelectionPreviewModule {
  selectionFromArgv: (argv: string[]) => string;
  previewArgsForSelection: (selection: string) => string[];
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

async function canRunOsascript(): Promise<boolean> {
  if (Deno.build.os !== "darwin") {
    return false;
  }

  const permission = await Deno.permissions.query({
    name: "run",
    command: "/usr/bin/osascript",
  });
  return permission.state === "granted";
}

async function runOsascript(scriptArgs: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const command = new Deno.Command("/usr/bin/osascript", {
    args: ["-l", "JavaScript", ...scriptArgs],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  const decoder = new TextDecoder();

  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
  };
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

Deno.test("context probe is opt-in and avoids mutation APIs", async () => {
  const script = await Deno.readTextFile("scripts/la_context_probe.js");

  assert(script.includes("NSPasteboard"), "expected clipboard read support");
  assert(script.includes("NSWorkspace"), "expected frontmost app read support");
  assert(
    script.includes("--include-clipboard"),
    "expected opt-in clipboard flag",
  );
  assert(
    script.includes("--include-frontmost-app"),
    "expected opt-in frontmost app flag",
  );

  const banned = [
    "System Events",
    "keystroke",
    "clearContents",
    "setString",
    "writeObjects",
    "setTheClipboardTo",
    "activate",
    "frontmost = true",
    "writeToFile",
    "removeItemAtPath",
  ];

  for (const token of banned) {
    assert(
      !script.includes(token),
      `unexpected probe mutation token: ${token}`,
    );
  }
});

Deno.test("selection preview wrapper is read-only and calls the preview script", async () => {
  const script = await Deno.readTextFile("scripts/la_selection_preview.js");

  assert(
    script.includes("scripts/la_command_preview.js"),
    "expected selection wrapper to call the command preview",
  );
  assert(
    script.includes('"explain"'),
    "expected selection wrapper to use fixed explain command",
  );
  assert(script.includes("$.NSTask"), "expected NSTask invocation");
  assert(!script.includes("deno run"), "wrapper should not call deno directly");

  const banned = [
    "NSPasteboard",
    "NSWorkspace",
    "System Events",
    "keystroke",
    "setTheClipboardTo",
    "writeToFile",
    "removeItemAtPath",
  ];

  for (const token of banned) {
    assert(
      !script.includes(token),
      `unexpected selection wrapper token: ${token}`,
    );
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

Deno.test("context probe parses selection and clipboard guard flags", async () => {
  const probe = await importJxaModule<ContextProbeModule>(
    "scripts/la_context_probe.js",
    ["parseProbeArgs", "normalizeClipboardText"],
  );

  const parsed = probe.parseProbeArgs([
    "--",
    "--selection",
    "Hola mundo",
    "--include-clipboard",
    "--max-clipboard-chars",
    "4",
    "--include-frontmost-app",
  ]);

  assert(parsed.selection === "Hola mundo", "expected explicit selection");
  assert(parsed.includeClipboard === true, "expected clipboard include flag");
  assert(
    parsed.includeFrontmostApp === true,
    "expected frontmost app include flag",
  );
  assert(parsed.maxClipboardChars === 4, "expected max clipboard chars");

  const clipboard = probe.normalizeClipboardText("abcdef", 4);
  assert(clipboard.available === true, "expected clipboard availability");
  assert(clipboard.text === "abcd", "expected truncated clipboard text");
  assert(clipboard.truncated === true, "expected truncated marker");

  const missing = probe.normalizeClipboardText(null, 4);
  assert(missing.available === false, "expected missing clipboard state");
  assert(missing.text === null, "expected null clipboard text");

  let rejectedZero = false;
  try {
    probe.parseProbeArgs(["--include-clipboard", "--max-clipboard-chars", "0"]);
  } catch {
    rejectedZero = true;
  }
  assert(rejectedZero, "expected zero clipboard limit to be rejected");
});

Deno.test("selection preview wrapper builds fixed explain selection args", async () => {
  const selectionPreview = await importJxaModule<SelectionPreviewModule>(
    "scripts/la_selection_preview.js",
    ["selectionFromArgv", "previewArgsForSelection"],
  );

  assert(
    selectionPreview.selectionFromArgv(["--", "Hola mundo"]) === "Hola mundo",
    "expected osascript separator to be ignored",
  );
  assert(
    selectionPreview.selectionFromArgv(["line 1", "line 2"]) ===
      "line 1\nline 2",
    "expected multiple argv values to remain readable",
  );
  assert(
    JSON.stringify(selectionPreview.previewArgsForSelection("Hola mundo")) ===
      JSON.stringify(["explain", "--selection", "Hola mundo"]),
    "expected fixed explain selection preview args",
  );
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

Deno.test("command preview parses explicit context probe flags", async () => {
  const preview = await importJxaModule<PreviewModule>(
    "scripts/la_command_preview.js",
    ["parsePreviewArgs", "contextProbeArgs"],
  );

  const parsed = preview.parsePreviewArgs([
    "--",
    "explain",
    "--selection",
    "Hola mundo",
    "--include-clipboard",
    "--max-clipboard-chars",
    "123",
    "--include-frontmost-app",
  ], () => null);

  assert(parsed.commandId === "explain", "expected command id");
  assert(parsed.context.selection === "Hola mundo", "expected selection");
  assert(parsed.probe.includeClipboard === true, "expected clipboard probe");
  assert(
    parsed.probe.includeFrontmostApp === true,
    "expected frontmost app probe",
  );
  assert(parsed.probe.maxClipboardChars === 123, "expected max chars");
  assert(
    JSON.stringify(preview.contextProbeArgs(parsed)) === JSON.stringify([
      "--selection",
      "Hola mundo",
      "--include-clipboard",
      "--max-clipboard-chars",
      "123",
      "--include-frontmost-app",
    ]),
    "expected preview to build probe argv",
  );

  let rejectedZero = false;
  try {
    preview.parsePreviewArgs([
      "--",
      "explain",
      "--include-clipboard",
      "--max-clipboard-chars",
      "0",
    ], () => null);
  } catch {
    rejectedZero = true;
  }
  assert(rejectedZero, "expected zero clipboard limit to be rejected");
});

Deno.test("info plist wires dev-only Universal Action selection preview", async () => {
  const plist = await Deno.readTextFile("info.plist");

  assert(
    plist.includes("<string>La Core Preview Selection</string>"),
    "expected new Universal Action name",
  );
  assert(
    plist.includes("<string>1DCA2182-6AAC-4BFC-8537-F0A250AC21DE</string>"),
    "expected Universal Action uid",
  );
  assert(
    plist.includes("<string>26BF14CE-F3C6-429C-8658-A0D40662566B</string>"),
    "expected selection Text View uid",
  );
  assert(
    plist.includes("<string>scripts/la_selection_preview.js</string>"),
    "expected selection preview Text View script",
  );
  assert(
    plist.includes(
      "<string>Batch 10 dev-only Universal Action selection preview</string>",
    ),
    "expected Batch 10 uidata note",
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

Deno.test("command preview gives probe context priority over simulated environment", async () => {
  const preview = await importJxaModule<PreviewModule>(
    "scripts/la_command_preview.js",
    ["parsePreviewArgs", "applyProbeContext", "probeAdapterNotes"],
  );
  const env = new Map([
    ["LA_SIM_CLIPBOARD", "env clipboard"],
    ["LA_SIM_FRONTMOST_APP", "Env App"],
  ]);

  const parsed = preview.parsePreviewArgs([
    "--",
    "explain",
    "--include-clipboard",
    "--include-frontmost-app",
  ], (name) => env.get(name) ?? null);

  preview.applyProbeContext(parsed, {
    ok: true,
    context: {
      clipboard: {
        text: "real clipboard",
        available: true,
        truncated: false,
      },
      frontmost_app: {
        name: "Safari",
        bundle_id: "com.apple.Safari",
        path: "/Applications/Safari.app",
      },
    },
    notes: [],
  });

  assert(
    parsed.context.clipboard === "real clipboard",
    "expected probe clipboard to override simulated environment",
  );
  assert(
    parsed.context.frontmostApp === "Safari",
    "expected probe frontmost app to override simulated environment",
  );

  const notes = preview.probeAdapterNotes({
    context: {
      clipboard: {
        text: "real clipboard",
        available: true,
        truncated: false,
      },
      frontmost_app: {
        name: "Safari",
        bundle_id: "com.apple.Safari",
        path: "/Applications/Safari.app",
      },
    },
    notes: [],
  });

  assert(
    notes.includes("frontmost_app_bundle_id: com.apple.Safari"),
    "expected bundle id adapter note",
  );
  assert(
    notes.includes("frontmost_app_path: /Applications/Safari.app"),
    "expected path adapter note",
  );
});

Deno.test("command preview keeps explicit argv context ahead of probe context", async () => {
  const preview = await importJxaModule<PreviewModule>(
    "scripts/la_command_preview.js",
    ["parsePreviewArgs", "applyProbeContext"],
  );

  const parsed = preview.parsePreviewArgs([
    "--",
    "explain",
    "--clipboard",
    "argv clipboard",
    "--frontmost-app",
    "Argv App",
    "--include-clipboard",
    "--include-frontmost-app",
  ], () => null);

  preview.applyProbeContext(parsed, {
    ok: true,
    context: {
      clipboard: {
        text: "real clipboard",
        available: true,
        truncated: false,
      },
      frontmost_app: {
        name: "Safari",
        bundle_id: "com.apple.Safari",
        path: "/Applications/Safari.app",
      },
    },
    notes: [],
  });

  assert(
    parsed.context.clipboard === "argv clipboard",
    "expected argv clipboard to win",
  );
  assert(
    parsed.context.frontmostApp === "Argv App",
    "expected argv frontmost app to win",
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

  const withAdapterNotes = preview.formatPreview({
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
        extra: null,
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
  }, ["frontmost_app_bundle_id: com.apple.Safari"]);

  assert(
    withAdapterNotes.includes("Adapter notes"),
    "expected adapter notes section",
  );
  assert(
    withAdapterNotes.includes("- frontmost_app_bundle_id: com.apple.Safari"),
    "expected adapter note content",
  );
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

Deno.test("osascript selection preview smoke accepts selected text", async () => {
  if (!(await canRunOsascript())) {
    return;
  }

  const result = await runOsascript([
    "scripts/la_selection_preview.js",
    "--",
    "Hola mundo",
  ]);

  assert(result.code === 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  const response = String(payload.response);
  assert(
    response.includes("Command: explain"),
    "expected fixed explain command",
  );
  assert(
    response.includes("- selection: Hola mundo"),
    "expected selected text in preview response",
  );
  assert(
    response.includes("- clipboard: null"),
    "expected clipboard to stay null",
  );
  assert(
    response.includes("- frontmost_app: null"),
    "expected frontmost app to stay null",
  );
});

Deno.test("osascript context probe smoke supports explicit selection", async () => {
  if (!(await canRunOsascript())) {
    return;
  }

  const result = await runOsascript([
    "scripts/la_context_probe.js",
    "--",
    "--selection",
    "Hola mundo",
  ]);

  assert(result.code === 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === true, "expected ok probe payload");
  assert(
    payload.context.selection === "Hola mundo",
    "expected selected text in probe payload",
  );
  assert(payload.context.clipboard === null, "clipboard should be opt-in");
});

Deno.test("osascript context probe smoke supports frontmost app include", async () => {
  if (!(await canRunOsascript())) {
    return;
  }

  const result = await runOsascript([
    "scripts/la_context_probe.js",
    "--",
    "--include-frontmost-app",
  ]);

  assert(result.code === 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === true, "expected ok probe payload");
  assert(
    payload.context.frontmost_app === null ||
      typeof payload.context.frontmost_app.name === "string" ||
      payload.context.frontmost_app.name === null,
    "expected null or structured frontmost app payload",
  );
});

Deno.test("osascript command preview smoke accepts selection and frontmost probe", async () => {
  if (!(await canRunOsascript())) {
    return;
  }

  const result = await runOsascript([
    "scripts/la_command_preview.js",
    "--",
    "explain",
    "--selection",
    "Hola mundo",
    "--include-frontmost-app",
  ]);

  assert(result.code === 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert(
    String(payload.response).includes("- selection: Hola mundo"),
    "expected selection in preview response",
  );
  assert(
    String(payload.response).includes("- frontmost_app:"),
    "expected frontmost app line in preview response",
  );
});
