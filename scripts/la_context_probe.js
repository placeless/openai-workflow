#!/usr/bin/osascript -l JavaScript

ObjC.import("Foundation");
ObjC.import("AppKit");

const DEFAULT_MAX_CLIPBOARD_CHARS = 8000;

function startsWithOption(value) {
  return typeof value === "string" && value.indexOf("--") === 0;
}

function errorPayload(code, message, details) {
  const error = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return { ok: false, error };
}

function blankContext() {
  return {
    selection: null,
    clipboard: null,
    frontmost_app: null,
    extra: null,
  };
}

function parsePositiveInteger(value, optionName) {
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw errorPayload(
      "CONTEXT_PROBE_USAGE",
      `${optionName} must be a positive integer.`,
    );
  }

  return Number(text);
}

function parseProbeArgs(argv) {
  const options = {
    selection: null,
    includeClipboard: false,
    includeFrontmostApp: false,
    maxClipboardChars: DEFAULT_MAX_CLIPBOARD_CHARS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index]);
    if (arg === "--") {
      continue;
    }

    if (arg === "--selection") {
      const value = argv[index + 1];
      if (value === undefined || startsWithOption(value)) {
        throw errorPayload(
          "CONTEXT_PROBE_USAGE",
          "Missing value for --selection",
        );
      }
      options.selection = String(value);
      index += 1;
      continue;
    }

    if (arg === "--include-clipboard") {
      options.includeClipboard = true;
      continue;
    }

    if (arg === "--include-frontmost-app") {
      options.includeFrontmostApp = true;
      continue;
    }

    if (arg === "--max-clipboard-chars") {
      const value = argv[index + 1];
      if (value === undefined || startsWithOption(value)) {
        throw errorPayload(
          "CONTEXT_PROBE_USAGE",
          "Missing value for --max-clipboard-chars",
        );
      }
      options.maxClipboardChars = parsePositiveInteger(
        value,
        "--max-clipboard-chars",
      );
      index += 1;
      continue;
    }

    throw errorPayload(
      "CONTEXT_PROBE_USAGE",
      `Unknown context probe option: ${arg}`,
    );
  }

  return options;
}

function jsString(value) {
  if (!value) {
    return null;
  }

  const text = value.js;
  return text === undefined || text === null ? null : String(text);
}

function normalizeClipboardText(value, maxChars) {
  if (value === undefined || value === null || value === "") {
    return {
      text: null,
      available: false,
      truncated: false,
    };
  }

  const text = String(value);
  if (text.length > maxChars) {
    return {
      text: text.slice(0, maxChars),
      available: true,
      truncated: true,
    };
  }

  return {
    text,
    available: true,
    truncated: false,
  };
}

function readClipboardText() {
  const pasteboard = $.NSPasteboard.generalPasteboard;
  const pasteboardType = $.NSPasteboardTypeString ||
    $("public.utf8-plain-text");
  return jsString(pasteboard.stringForType(pasteboardType));
}

function readFrontmostApp() {
  const app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
  if (!app) {
    return null;
  }

  const bundleURL = app.bundleURL;
  return {
    name: jsString(app.localizedName),
    bundle_id: jsString(app.bundleIdentifier),
    path: bundleURL ? jsString(bundleURL.path) : null,
  };
}

function collectContext(options) {
  const context = blankContext();
  const notes = [];

  context.selection = options.selection;

  if (options.includeClipboard) {
    try {
      context.clipboard = normalizeClipboardText(
        readClipboardText(),
        options.maxClipboardChars,
      );
    } catch (error) {
      context.clipboard = {
        text: null,
        available: false,
        truncated: false,
      };
      notes.push(`Clipboard read failed: ${String(error)}`);
    }
  }

  if (options.includeFrontmostApp) {
    try {
      context.frontmost_app = readFrontmostApp();
      if (!context.frontmost_app) {
        notes.push("Frontmost app metadata was unavailable.");
      }
    } catch (error) {
      context.frontmost_app = null;
      notes.push(`Frontmost app read failed: ${String(error)}`);
    }
  }

  return {
    ok: true,
    context,
    notes,
  };
}

function execute(argv) {
  try {
    return JSON.stringify(collectContext(parseProbeArgs(argv)), null, 2);
  } catch (error) {
    const payload = error && error.ok === false
      ? error
      : errorPayload("CONTEXT_PROBE_ERROR", String(error));
    return JSON.stringify(payload, null, 2);
  }
}

function run(argv) {
  return execute(argv);
}
