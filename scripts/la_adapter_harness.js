#!/usr/bin/osascript -l JavaScript

ObjC.import("Foundation");

const CORE_OPTIONS = {
  "--config": true,
  "--selection": true,
  "--clipboard": true,
  "--frontmost-app": true,
  "--extra": true,
};

function envVar(name) {
  const value = $.NSProcessInfo.processInfo.environment.objectForKey(name);
  return value ? value.js : null;
}

function joinPath(base, child) {
  return base.endsWith("/") ? `${base}${child}` : `${base}/${child}`;
}

function currentDirectory() {
  return $.NSFileManager.defaultManager.currentDirectoryPath.js;
}

function isExecutable(path) {
  return $.NSFileManager.defaultManager.isExecutableFileAtPath(path);
}

function truncate(text) {
  const value = text === undefined || text === null ? "" : String(text);
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}

function errorPayload(code, message, details) {
  const error = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return { ok: false, error };
}

function resolveLauncher() {
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
    const launcher = joinPath(root, "scripts/la-core-dev.sh");
    if (isExecutable(launcher)) {
      return { root, launcher };
    }
  }

  throw errorPayload(
    "ADAPTER_LAUNCHER_NOT_FOUND",
    "Could not find executable scripts/la-core-dev.sh. Run from the repo root or set LA_REPO_ROOT.",
  );
}

function startsWithOption(value) {
  return typeof value === "string" && value.indexOf("--") === 0;
}

function parseCoreArgs(coreArgs) {
  const positionals = [];

  for (let index = 0; index < coreArgs.length; index += 1) {
    const arg = coreArgs[index];
    if (!startsWithOption(arg)) {
      positionals.push(arg);
      continue;
    }

    if (!CORE_OPTIONS[arg]) {
      throw errorPayload("ADAPTER_USAGE", `Unknown harness option: ${arg}`);
    }

    const value = coreArgs[index + 1];
    if (value === undefined || startsWithOption(value)) {
      throw errorPayload("ADAPTER_USAGE", `Missing value for ${arg}`);
    }
    index += 1;
  }

  const mode = positionals[0];
  if (!mode) {
    throw errorPayload("ADAPTER_USAGE", "Missing harness mode.");
  }

  if (!["commands", "quick", "command", "config-check"].includes(mode)) {
    throw errorPayload("ADAPTER_USAGE", `Unsupported harness mode: ${mode}`);
  }

  if (mode === "quick" && positionals.length < 2) {
    throw errorPayload("ADAPTER_USAGE", "quick requires a message.");
  }

  if (mode === "command" && positionals.length < 2) {
    throw errorPayload("ADAPTER_USAGE", "command requires a command id.");
  }

  if (
    (mode === "commands" || mode === "config-check") && positionals.length > 1
  ) {
    throw errorPayload(
      "ADAPTER_USAGE",
      `${mode} does not accept positional arguments.`,
    );
  }

  return { mode };
}

function parseHarnessArgs(argv) {
  const coreArgs = [];
  let raw = false;

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--raw") {
      raw = true;
      continue;
    }
    coreArgs.push(arg);
  }

  const parsedCore = parseCoreArgs(coreArgs);
  return { raw, coreArgs, mode: parsedCore.mode };
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

function runLauncher(launcher, root, args) {
  const task = $.NSTask.alloc.init;
  const stdoutPipe = $.NSPipe.pipe;
  const stderrPipe = $.NSPipe.pipe;

  task.executableURL = $.NSURL.fileURLWithPath(launcher);
  task.currentDirectoryURL = $.NSURL.fileURLWithPath(root);
  task.arguments = args;
  task.standardOutput = stdoutPipe;
  task.standardError = stderrPipe;

  try {
    if (!task.launchAndReturnError(undefined)) {
      return {
        launchError: "NSTask launchAndReturnError returned false.",
      };
    }
  } catch (error) {
    return {
      launchError: error instanceof Error ? error.message : String(error),
    };
  }

  task.waitUntilExit;

  return {
    exitStatus: task.terminationStatus,
    stdout: stringFromData(stdoutPipe.fileHandleForReading.readDataToEndOfFile),
    stderr: stringFromData(stderrPipe.fileHandleForReading.readDataToEndOfFile),
  };
}

function parseLauncherResult(result) {
  if (result.launchError) {
    return {
      error: errorPayload(
        "ADAPTER_LAUNCH_FAILED",
        "Could not launch scripts/la-core-dev.sh.",
        { detail: result.launchError },
      ),
    };
  }

  const rawText = String(result.stdout || "").trim();
  if (!rawText) {
    return {
      error: errorPayload(
        "ADAPTER_EMPTY_OUTPUT",
        "La Core produced no JSON on stdout.",
        {
          exit_status: result.exitStatus,
          stderr: truncate(result.stderr),
        },
      ),
    };
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    return {
      error: errorPayload(
        "ADAPTER_INVALID_JSON",
        "La Core stdout was not valid JSON.",
        {
          exit_status: result.exitStatus,
          stdout: truncate(result.stdout),
          stderr: truncate(result.stderr),
        },
      ),
    };
  }

  if (result.exitStatus !== 0 && payload.ok !== false) {
    return {
      error: errorPayload(
        "ADAPTER_UNEXPECTED_EXIT",
        "La Core exited non-zero without a structured error payload.",
        {
          exit_status: result.exitStatus,
          stdout: truncate(result.stdout),
          stderr: truncate(result.stderr),
        },
      ),
    };
  }

  return { payload, rawText };
}

function errorToScriptFilter(title, payload) {
  const error = payload && payload.error ? payload.error : {};
  const code = error.code || "UNKNOWN_ERROR";
  const message = error.message || "Unknown error.";

  return {
    items: [{
      title,
      subtitle: `${code}: ${message}`,
      valid: false,
      variables: {
        la_error_code: code,
        la_error_message: message,
      },
    }],
  };
}

function commandsToScriptFilter(payload) {
  const commands = Array.isArray(payload.commands) ? payload.commands : [];
  if (commands.length === 0) {
    return {
      items: [{
        title: "No La Commands",
        subtitle: "La Core returned an empty command list.",
        valid: false,
      }],
    };
  }

  return {
    items: commands.map((command) => {
      const title = command.title || command.id;
      const subtitle = command.description || command.kind || "";
      return {
        uid: command.id,
        title,
        subtitle,
        arg: command.id,
        autocomplete: command.id,
        match: `${command.id} ${title} ${subtitle}`,
        valid: true,
        variables: {
          la_command: command.id,
          la_command_kind: command.kind || "",
        },
      };
    }),
  };
}

function dryRunToScriptFilter(payload) {
  const request = payload.request || {};
  const command = payload.resolved_command || {};
  const commandId = command.id || request.command || "";
  const title = `Dry Run: ${command.title || commandId || "La Core"}`;
  const context = request.context || {};
  const summary = [
    request.entry ? `entry: ${request.entry}` : null,
    request.output && request.output.mode
      ? `output: ${request.output.mode}`
      : null,
    context.query ? `query: ${truncate(context.query)}` : null,
    context.selection ? `selection: ${truncate(context.selection)}` : null,
  ].filter(Boolean).join(" | ");

  return {
    items: [{
      title,
      subtitle: summary || "Dry-run request built successfully.",
      arg: commandId,
      valid: false,
      variables: {
        la_command: commandId,
        la_core_mode: payload.mode || "",
      },
    }],
  };
}

function configCheckToScriptFilter(payload) {
  return {
    items: [{
      title: "La Core Config OK",
      subtitle: `${payload.config_path} (version ${payload.version})`,
      valid: false,
      variables: {
        la_core_mode: payload.mode || "",
      },
    }],
  };
}

function payloadToScriptFilter(payload) {
  if (payload.ok === false) {
    return errorToScriptFilter("La Core Error", payload);
  }

  if (payload.mode === "commands") {
    return commandsToScriptFilter(payload);
  }

  if (payload.mode === "dry_run") {
    return dryRunToScriptFilter(payload);
  }

  if (payload.mode === "config_check") {
    return configCheckToScriptFilter(payload);
  }

  return errorToScriptFilter(
    "La Adapter Error",
    errorPayload(
      "ADAPTER_UNSUPPORTED_RESPONSE",
      `Unsupported La Core response mode: ${payload.mode || "unknown"}`,
    ),
  );
}

function execute(argv) {
  let parsed;
  try {
    parsed = parseHarnessArgs(argv);
  } catch (error) {
    const payload = error && error.ok === false
      ? error
      : errorPayload("ADAPTER_USAGE", String(error));
    return argv.includes("--raw")
      ? JSON.stringify(payload, null, 2)
      : JSON.stringify(
        errorToScriptFilter("La Adapter Error", payload),
        null,
        2,
      );
  }

  let launcher;
  try {
    launcher = resolveLauncher();
  } catch (error) {
    const payload = error && error.ok === false
      ? error
      : errorPayload("ADAPTER_LAUNCHER_NOT_FOUND", String(error));
    return parsed.raw ? JSON.stringify(payload, null, 2) : JSON.stringify(
      errorToScriptFilter("La Adapter Error", payload),
      null,
      2,
    );
  }

  const result = parseLauncherResult(
    runLauncher(launcher.launcher, launcher.root, parsed.coreArgs),
  );

  if (result.error) {
    return parsed.raw ? JSON.stringify(result.error, null, 2) : JSON.stringify(
      errorToScriptFilter("La Adapter Error", result.error),
      null,
      2,
    );
  }

  if (parsed.raw) {
    return result.rawText;
  }

  return JSON.stringify(payloadToScriptFilter(result.payload), null, 2);
}

function run(argv) {
  return execute(argv);
}
