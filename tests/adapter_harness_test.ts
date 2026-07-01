function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
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
