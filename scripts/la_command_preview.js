#!/usr/bin/osascript -l JavaScript

ObjC.import("Foundation");

const CONFIG_PATH = "examples/la.v2.json";
const DEFAULT_MAX_CLIPBOARD_CHARS = 8000;
const CONTEXT_OPTIONS = {
  "--selection": "selection",
  "--clipboard": "clipboard",
  "--frontmost-app": "frontmostApp",
  "--extra": "extra",
};
const CONTEXT_ENV = {
  selection: "LA_SIM_SELECTION",
  clipboard: "LA_SIM_CLIPBOARD",
  frontmostApp: "LA_SIM_FRONTMOST_APP",
  extra: "LA_SIM_EXTRA",
};
const CONTEXT_TO_HARNESS_OPTION = {
  selection: "--selection",
  clipboard: "--clipboard",
  frontmostApp: "--frontmost-app",
  extra: "--extra",
};

function envVar(name) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name);
  return value ? value.js : null;
}

function currentDirectory() {
  return $.NSFileManager.defaultManager.currentDirectoryPath.js;
}

function joinPath(base, child) {
  return base.endsWith("/") ? `${base}${child}` : `${base}/${child}`;
}

function isReadable(path) {
  return $.NSFileManager.defaultManager.isReadableFileAtPath(path);
}

function startsWithOption(value) {
  return typeof value === "string" && value.indexOf("--") === 0;
}

function truncate(text) {
  const value = text === undefined || text === null ? "" : String(text);
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}

function textPayload(response, footer) {
  return JSON.stringify({
    response,
    footer: footer || "La Core dry-run preview",
    behaviour: { scroll: "end" },
  });
}

function errorPayload(code, message, details) {
  const error = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return { ok: false, error };
}

function errorText(title, payload) {
  const error = payload && payload.error ? payload.error : {};
  const code = error.code || "UNKNOWN_ERROR";
  const message = error.message || "Unknown error.";
  const details = error.details
    ? `\n\nDetails:\n${JSON.stringify(error.details, null, 2)}`
    : "";

  return `${title}\n\n${code}\n${message}${details}`;
}

function resolveRepoRoot() {
  const candidates = [];
  const envRoot = envVar("LA_REPO_ROOT");
  if (envRoot) {
    candidates.push(envRoot);
  }

  const cwd = currentDirectory();
  candidates.push(cwd);
  if (cwd.endsWith("/scripts")) {
    candidates.push(cwd.slice(0, -"/scripts".length));
  }

  for (const root of candidates) {
    if (isReadable(joinPath(root, "scripts/la_adapter_harness.js"))) {
      return root;
    }
  }

  throw errorPayload(
    "PREVIEW_HARNESS_NOT_FOUND",
    "Could not find scripts/la_adapter_harness.js. Run from the repo root or set LA_REPO_ROOT.",
  );
}

function blankContext() {
  return {
    selection: null,
    clipboard: null,
    frontmostApp: null,
    extra: null,
  };
}

function blankProbeOptions() {
  return {
    includeClipboard: false,
    includeFrontmostApp: false,
    maxClipboardChars: DEFAULT_MAX_CLIPBOARD_CHARS,
  };
}

function parsePositiveInteger(value, optionName) {
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw errorPayload(
      "PREVIEW_USAGE",
      `${optionName} must be a positive integer.`,
    );
  }

  return Number(text);
}

function parsePreviewArgs(argv, lookupEnv) {
  const positionals = [];
  const context = blankContext();
  const explicitContext = {};
  const probe = blankProbeOptions();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index]);
    if (arg === "--") {
      continue;
    }

    const contextField = CONTEXT_OPTIONS[arg];
    if (contextField) {
      const value = argv[index + 1];
      if (value === undefined || startsWithOption(value)) {
        throw errorPayload("PREVIEW_USAGE", `Missing value for ${arg}`);
      }
      context[contextField] = String(value);
      explicitContext[contextField] = true;
      index += 1;
      continue;
    }

    if (arg === "--include-clipboard") {
      probe.includeClipboard = true;
      continue;
    }

    if (arg === "--include-frontmost-app") {
      probe.includeFrontmostApp = true;
      continue;
    }

    if (arg === "--max-clipboard-chars") {
      const value = argv[index + 1];
      if (value === undefined || startsWithOption(value)) {
        throw errorPayload(
          "PREVIEW_USAGE",
          "Missing value for --max-clipboard-chars",
        );
      }
      probe.maxClipboardChars = parsePositiveInteger(
        value,
        "--max-clipboard-chars",
      );
      index += 1;
      continue;
    }

    if (startsWithOption(arg)) {
      throw errorPayload("PREVIEW_USAGE", `Unknown preview option: ${arg}`);
    }

    const value = arg.trim();
    if (value.length > 0) {
      positionals.push(value);
    }
  }

  let commandId = null;
  if (positionals.length > 0) {
    commandId = positionals[0];
  } else {
    const variableCommand = lookupEnv("la_command");
    if (variableCommand && variableCommand.trim().length > 0) {
      commandId = variableCommand.trim();
    }
  }

  if (!commandId) {
    throw errorPayload(
      "PREVIEW_MISSING_COMMAND",
      "No La Core command id was provided by Alfred.",
    );
  }

  for (const field of Object.keys(CONTEXT_ENV)) {
    if (explicitContext[field]) {
      continue;
    }
    const value = lookupEnv(CONTEXT_ENV[field]);
    if (value !== undefined && value !== null) {
      context[field] = String(value);
    }
  }

  return { commandId, context, explicitContext, probe };
}

function contextToHarnessArgs(context) {
  const args = [];
  for (const field of Object.keys(CONTEXT_TO_HARNESS_OPTION)) {
    const value = context[field];
    if (value !== undefined && value !== null) {
      args.push(CONTEXT_TO_HARNESS_OPTION[field], String(value));
    }
  }
  return args;
}

function shouldRunContextProbe(parsed) {
  return parsed.probe.includeClipboard || parsed.probe.includeFrontmostApp;
}

function contextProbeArgs(parsed) {
  const args = [];

  if (
    parsed.context.selection !== undefined && parsed.context.selection !== null
  ) {
    args.push("--selection", String(parsed.context.selection));
  }

  if (parsed.probe.includeClipboard) {
    args.push(
      "--include-clipboard",
      "--max-clipboard-chars",
      String(parsed.probe.maxClipboardChars),
    );
  }

  if (parsed.probe.includeFrontmostApp) {
    args.push("--include-frontmost-app");
  }

  return args;
}

function stringFromData(data) {
  if (!data || data.length === 0) {
    return "";
  }
  const value = $.NSString.alloc.initWithDataEncoding(
    data,
    $.NSUTF8StringEncoding,
  );
  return value ? value.js : "";
}

function runContextProbe(root, probeArgs) {
  const task = $.NSTask.alloc.init;
  const stdoutPipe = $.NSPipe.pipe;
  const stderrPipe = $.NSPipe.pipe;

  task.executableURL = $.NSURL.fileURLWithPath("/usr/bin/osascript");
  task.currentDirectoryURL = $.NSURL.fileURLWithPath(root);
  task.arguments = [
    "-l",
    "JavaScript",
    "scripts/la_context_probe.js",
    "--",
    ...probeArgs,
  ];
  task.standardOutput = stdoutPipe;
  task.standardError = stderrPipe;

  try {
    if (!task.launchAndReturnError(undefined)) {
      return {
        error: errorPayload(
          "PREVIEW_CONTEXT_PROBE_LAUNCH_FAILED",
          "Could not launch the La context probe.",
        ),
      };
    }
  } catch (error) {
    return {
      error: errorPayload(
        "PREVIEW_CONTEXT_PROBE_LAUNCH_FAILED",
        "Could not launch the La context probe.",
        { detail: error instanceof Error ? error.message : String(error) },
      ),
    };
  }

  task.waitUntilExit;

  const stdout = stringFromData(
    stdoutPipe.fileHandleForReading.readDataToEndOfFile,
  );
  const stderr = stringFromData(
    stderrPipe.fileHandleForReading.readDataToEndOfFile,
  );

  if (task.terminationStatus !== 0) {
    return {
      error: errorPayload(
        "PREVIEW_CONTEXT_PROBE_FAILED",
        "The La context probe exited with an error.",
        { exit_status: task.terminationStatus, stderr: truncate(stderr) },
      ),
    };
  }

  const rawText = String(stdout || "").trim();
  if (!rawText) {
    return {
      error: errorPayload(
        "PREVIEW_CONTEXT_PROBE_EMPTY_OUTPUT",
        "The La context probe produced no JSON on stdout.",
        { stderr: truncate(stderr) },
      ),
    };
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    return {
      error: errorPayload(
        "PREVIEW_CONTEXT_PROBE_INVALID_JSON",
        "The La context probe stdout was not valid JSON.",
        { stdout: truncate(stdout), stderr: truncate(stderr) },
      ),
    };
  }

  if (payload && payload.ok === false) {
    return {
      error: errorPayload(
        "PREVIEW_CONTEXT_PROBE_ERROR",
        "The La context probe returned an error.",
        payload.error || payload,
      ),
    };
  }

  return { payload };
}

function clipboardTextFromProbe(clipboard) {
  if (!clipboard || typeof clipboard !== "object") {
    return null;
  }
  if (clipboard.available === true && clipboard.text !== undefined) {
    return clipboard.text === null ? null : String(clipboard.text);
  }
  return null;
}

function frontmostAppNameFromProbe(frontmostApp) {
  if (!frontmostApp || typeof frontmostApp !== "object") {
    return null;
  }
  if (frontmostApp.name !== undefined && frontmostApp.name !== null) {
    return String(frontmostApp.name);
  }
  return null;
}

function probeAdapterNotes(payload) {
  const context = payload && payload.context ? payload.context : {};
  const notes = [];
  const probeNotes = Array.isArray(payload && payload.notes)
    ? payload.notes
    : [];

  if (context.clipboard && typeof context.clipboard === "object") {
    if (context.clipboard.truncated === true) {
      notes.push(
        `Context probe clipboard was truncated to ${
          String(context.clipboard.text || "").length
        } characters.`,
      );
    }
    if (context.clipboard.available === false) {
      notes.push("Context probe found no plain text clipboard content.");
    }
  }

  if (context.frontmost_app && typeof context.frontmost_app === "object") {
    const frontmostApp = context.frontmost_app;
    if (frontmostApp.bundle_id) {
      notes.push(`frontmost_app_bundle_id: ${frontmostApp.bundle_id}`);
    }
    if (frontmostApp.path) {
      notes.push(`frontmost_app_path: ${frontmostApp.path}`);
    }
  }

  for (const note of probeNotes) {
    notes.push(String(note));
  }

  return notes;
}

function applyProbeContext(parsed, payload) {
  const context = payload && payload.context ? payload.context : {};

  if (!parsed.explicitContext.clipboard && context.clipboard !== undefined) {
    const clipboard = clipboardTextFromProbe(context.clipboard);
    if (clipboard !== null) {
      parsed.context.clipboard = clipboard;
    }
  }

  if (
    !parsed.explicitContext.frontmostApp &&
    context.frontmost_app !== undefined
  ) {
    const frontmostAppName = frontmostAppNameFromProbe(context.frontmost_app);
    if (frontmostAppName !== null) {
      parsed.context.frontmostApp = frontmostAppName;
    }
  }
}

function runHarness(root, commandId, contextArgs) {
  const task = $.NSTask.alloc.init;
  const stdoutPipe = $.NSPipe.pipe;
  const stderrPipe = $.NSPipe.pipe;

  task.executableURL = $.NSURL.fileURLWithPath("/usr/bin/osascript");
  task.currentDirectoryURL = $.NSURL.fileURLWithPath(root);
  task.arguments = [
    "-l",
    "JavaScript",
    "scripts/la_adapter_harness.js",
    "--",
    "--raw",
    "command",
    commandId,
    ...contextArgs,
    "--config",
    CONFIG_PATH,
  ];
  task.standardOutput = stdoutPipe;
  task.standardError = stderrPipe;

  try {
    if (!task.launchAndReturnError(undefined)) {
      return {
        error: errorPayload(
          "PREVIEW_LAUNCH_FAILED",
          "Could not launch the La adapter harness.",
        ),
      };
    }
  } catch (error) {
    return {
      error: errorPayload(
        "PREVIEW_LAUNCH_FAILED",
        "Could not launch the La adapter harness.",
        { detail: error instanceof Error ? error.message : String(error) },
      ),
    };
  }

  task.waitUntilExit;

  const stdout = stringFromData(
    stdoutPipe.fileHandleForReading.readDataToEndOfFile,
  );
  const stderr = stringFromData(
    stderrPipe.fileHandleForReading.readDataToEndOfFile,
  );

  if (task.terminationStatus !== 0) {
    return {
      error: errorPayload(
        "PREVIEW_ADAPTER_FAILED",
        "The La adapter harness exited with an error.",
        { exit_status: task.terminationStatus, stderr: truncate(stderr) },
      ),
    };
  }

  const rawText = String(stdout || "").trim();
  if (!rawText) {
    return {
      error: errorPayload(
        "PREVIEW_EMPTY_OUTPUT",
        "The La adapter harness produced no JSON on stdout.",
        { stderr: truncate(stderr) },
      ),
    };
  }

  try {
    return { payload: JSON.parse(rawText) };
  } catch (error) {
    return {
      error: errorPayload(
        "PREVIEW_INVALID_JSON",
        "The La adapter harness stdout was not valid JSON.",
        { stdout: truncate(stdout), stderr: truncate(stderr) },
      ),
    };
  }
}

function displayValue(value) {
  if (value === undefined || value === null || value === "") {
    return "null";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function listValue(values) {
  return Array.isArray(values) && values.length > 0
    ? values.join(", ")
    : "none";
}

function outputMode(request, command) {
  if (request.output && request.output.mode) {
    return request.output.mode;
  }
  return command.output_mode || "show";
}

function modelRoute(request, command) {
  if (request.model_route && request.model_route.id) {
    return request.model_route.id;
  }
  return command.model_route || "none";
}

function formatPreview(payload, adapterNotes) {
  if (payload.ok === false) {
    return errorText("La Core Error", payload);
  }

  if (payload.mode !== "dry_run") {
    return errorText(
      "La Adapter Error",
      errorPayload(
        "PREVIEW_UNSUPPORTED_RESPONSE",
        `Expected dry_run response, received ${payload.mode || "unknown"}.`,
      ),
    );
  }

  const request = payload.request || {};
  const command = payload.resolved_command || {};
  const context = request.context || {};
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const previewNotes = Array.isArray(adapterNotes) ? adapterNotes : [];

  const lines = [
    "La Core Dry Run",
    "",
    `Command: ${command.id || request.command || "unknown"}`,
    `Kind: ${command.kind || request.entry || "unknown"}`,
    `Model route: ${modelRoute(request, command)}`,
    `Output mode: ${outputMode(request, command)}`,
    `Tools: ${listValue(request.tools || command.tools)}`,
    `Requires confirmation: ${
      command.requires_confirmation === true ? "yes" : "no"
    }`,
    `Config: ${CONFIG_PATH}`,
    "",
    "Context",
    `- query: ${displayValue(context.query)}`,
    `- selection: ${displayValue(context.selection)}`,
    `- clipboard: ${displayValue(context.clipboard)}`,
    `- frontmost_app: ${displayValue(context.frontmost_app)}`,
    `- extra: ${displayValue(context.extra)}`,
  ];

  if (previewNotes.length > 0) {
    lines.push("", "Adapter notes", ...previewNotes.map((note) => `- ${note}`));
  }

  if (notes.length > 0) {
    lines.push("", ...notes);
  }

  return lines.join("\n");
}

function execute(argv) {
  let parsed;
  let root;
  const adapterNotes = [];
  try {
    parsed = parsePreviewArgs(argv, envVar);
    root = resolveRepoRoot();
  } catch (error) {
    const payload = error && error.ok === false
      ? error
      : errorPayload("PREVIEW_ERROR", String(error));
    return textPayload(errorText("La Adapter Error", payload));
  }

  if (shouldRunContextProbe(parsed)) {
    const probeResult = runContextProbe(root, contextProbeArgs(parsed));
    if (probeResult.error) {
      return textPayload(errorText("La Adapter Error", probeResult.error));
    }
    applyProbeContext(parsed, probeResult.payload);
    adapterNotes.push(...probeAdapterNotes(probeResult.payload));
  }

  const result = runHarness(
    root,
    parsed.commandId,
    contextToHarnessArgs(parsed.context),
  );
  if (result.error) {
    return textPayload(errorText("La Adapter Error", result.error));
  }

  return textPayload(formatPreview(result.payload, adapterNotes));
}

function run(argv) {
  return execute(argv);
}
