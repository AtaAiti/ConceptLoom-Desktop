import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("failed persistence retains checkpoint for retry; successful assessment consumes it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "loom-bridge-"));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/bridge.mjs", import.meta.url))], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  const replies = lines[Symbol.asyncIterator]();
  let id = 0;
  const call = async (name, args) => {
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) + "\n",
    );
    return JSON.parse((await replies.next()).value).result;
  };
  try {
    const card = await call("loom_frame_checkpoint", {
      prompt: "Choose",
      choices: [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ],
      expected: "a",
      rationale: "A",
    });
    const request = { token: card.structuredContent.token, sessionId: "session", selected: "a", nextStep: "Next" };
    assert.equal((await call("loom_assess_checkpoint", request)).isError, true);
    await call("loom_save_learning_state", {
      sessionId: "session",
      topic: "Topic",
      goal: "Goal",
      phase: "build",
      nextStep: "Check",
    });
    assert.equal((await call("loom_assess_checkpoint", request)).structuredContent.accurate, true);
    assert.equal((await call("loom_assess_checkpoint", request)).isError, true);
  } finally {
    lines.close();
    child.kill();
  }
});
