#!/usr/bin/osascript -l JavaScript

ObjC.import("Foundation");

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
    footer: footer || "La Core selection preview",
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
    if (isReadable(joinPath(root, "scripts/la_command_preview.js"))) {
      return root;
    }
  }

  throw errorPayload(
    "SELECTION_PREVIEW_NOT_FOUND",
    "Could not find scripts/la_command_preview.js. Run from the repo root or set LA_REPO_ROOT.",
  );
}

function selectionFromArgv(argv) {
  const values = [];
  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    values.push(String(arg));
  }
  return values.join("\n");
}

function previewArgsForSelection(selection) {
  return ["explain", "--selection", selection];
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

function runPreview(root, previewArgs) {
  const task = $.NSTask.alloc.init;
  const stdoutPipe = $.NSPipe.pipe;
  const stderrPipe = $.NSPipe.pipe;

  task.executableURL = $.NSURL.fileURLWithPath("/usr/bin/osascript");
  task.currentDirectoryURL = $.NSURL.fileURLWithPath(root);
  task.arguments = [
    "-l",
    "JavaScript",
    "scripts/la_command_preview.js",
    "--",
    ...previewArgs,
  ];
  task.standardOutput = stdoutPipe;
  task.standardError = stderrPipe;

  try {
    if (!task.launchAndReturnError(undefined)) {
      return {
        error: errorPayload(
          "SELECTION_PREVIEW_LAUNCH_FAILED",
          "Could not launch the La command preview.",
        ),
      };
    }
  } catch (error) {
    return {
      error: errorPayload(
        "SELECTION_PREVIEW_LAUNCH_FAILED",
        "Could not launch the La command preview.",
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
        "SELECTION_PREVIEW_FAILED",
        "The La command preview exited with an error.",
        { exit_status: task.terminationStatus, stderr: truncate(stderr) },
      ),
    };
  }

  const rawText = String(stdout || "").trim();
  if (!rawText) {
    return {
      error: errorPayload(
        "SELECTION_PREVIEW_EMPTY_OUTPUT",
        "The La command preview produced no JSON on stdout.",
        { stderr: truncate(stderr) },
      ),
    };
  }

  try {
    JSON.parse(rawText);
  } catch (error) {
    return {
      error: errorPayload(
        "SELECTION_PREVIEW_INVALID_JSON",
        "The La command preview stdout was not valid JSON.",
        { stdout: truncate(stdout), stderr: truncate(stderr) },
      ),
    };
  }

  return { rawText };
}

function execute(argv) {
  let root;
  try {
    root = resolveRepoRoot();
  } catch (error) {
    const payload = error && error.ok === false
      ? error
      : errorPayload("SELECTION_PREVIEW_ERROR", String(error));
    return textPayload(errorText("La Adapter Error", payload));
  }

  const result = runPreview(
    root,
    previewArgsForSelection(selectionFromArgv(argv)),
  );
  if (result.error) {
    return textPayload(errorText("La Adapter Error", result.error));
  }

  return result.rawText;
}

function run(argv) {
  return execute(argv);
}
