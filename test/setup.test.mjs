import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const host of ["claude-code", "opencode"]) {
  test(`${host} installer writes parseable JSON with the exact server path`, async () => {
    const target = await mkdtemp(join(tmpdir(), "loom-config-"));
    const result = spawnSync(process.execPath, [join(projectRoot, "scripts/setup.mjs"), host, "--target", target], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(
      await readFile(join(target, host === "claude-code" ? ".mcp.json" : "opencode.json"), "utf8"),
    );
    const server =
      host === "claude-code" ? config.mcpServers["concept-loom"].args[0] : config.mcp["concept-loom"].command[1];
    assert.equal(server, join(projectRoot, "src/bridge.mjs"));
  });
}

test("missing --target value prints usage without an uncaught exception", () => {
  const result = spawnSync(process.execPath, [join(projectRoot, "scripts/setup.mjs"), "codex", "--target"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

test("DeepSeek Harness installer creates a native skill and MCP patch", async () => {
  const target = await mkdtemp(join(tmpdir(), "concept-loom-dsh-"));
  const result = spawnSync(
    process.execPath,
    [join(projectRoot, "scripts", "setup.mjs"), "deepseek-harness", "--target", target],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const skill = await readFile(join(target, ".dsh", "skills", "concept-coach", "SKILL.md"), "utf8");
  const reference = await readFile(
    join(target, ".dsh", "skills", "concept-coach", "references", "coaching-reference.md"),
    "utf8",
  );
  const patch = await readFile(join(target, ".dsh", "concept-loom.patch.yml"), "utf8");
  await stat(join(target, "AGENTS.md"));

  assert.match(skill, /name: concept-coach/);
  assert.match(reference, /# Connection-first coaching reference/);
  assert.match(patch, /name: '@deepseek-ai\/dsh-mcp-client'/);
  assert.match(patch, new RegExp(join(projectRoot, "src", "bridge.mjs").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(patch, /__SERVER_PATH__/);
});

test("DeepSeek Harness --skip-mcp installs only workspace guidance", async () => {
  const target = await mkdtemp(join(tmpdir(), "concept-loom-dsh-skip-"));
  const result = spawnSync(
    process.execPath,
    [join(projectRoot, "scripts", "setup.mjs"), "deepseek-harness", "--target", target, "--skip-mcp"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  await stat(join(target, ".dsh", "skills", "concept-coach", "SKILL.md"));
  await assert.rejects(stat(join(target, ".dsh", "concept-loom.patch.yml")), { code: "ENOENT" });
});
