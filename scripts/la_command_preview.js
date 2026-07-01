#!/usr/bin/osascript -l JavaScript

ObjC.import("Foundation");

const CONFIG_PATH = "examples/la.v2.json";

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

function commandFromArgs(argv) {
  for (const arg of argv) {
    if (arg !== "--" && String(arg).trim().length > 0) {
      return String(arg).trim();
    }
  }

  const variableCommand = envVar("la_command");
  if (variableCommand && variableCommand.trim().length > 0) {
    return variableCommand.trim();
  }

  throw errorPayload(
    "PREVIEW_MISSING_COMMAND",
    "No La Core command id was provided by Alfred.",
  );
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

function runHarness(root, commandId) {
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

function formatPreview(payload) {
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
    "Context:",
    `- query=${displayValue(context.query)}`,
    `- selection=${displayValue(context.selection)}`,
    `- clipboard=${displayValue(context.clipboard)}`,
    `- frontmost_app=${displayValue(context.frontmost_app)}`,
    `- extra=${displayValue(context.extra)}`,
  ];

  if (notes.length > 0) {
    lines.push("", ...notes);
  }

  return lines.join("\n");
}

function execute(argv) {
  let commandId;
  let root;
  try {
    commandId = commandFromArgs(argv);
    root = resolveRepoRoot();
  } catch (error) {
    const payload = error && error.ok === false
      ? error
      : errorPayload("PREVIEW_ERROR", String(error));
    return textPayload(errorText("La Adapter Error", payload));
  }

  const result = runHarness(root, commandId);
  if (result.error) {
    return textPayload(errorText("La Adapter Error", result.error));
  }

  return textPayload(formatPreview(result.payload));
}

function run(argv) {
  return execute(argv);
}
