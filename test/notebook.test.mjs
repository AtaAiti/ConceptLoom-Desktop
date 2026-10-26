import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beginNotebook, addNotebookEntry, resolveNotebookPath } from "../src/notebook.mjs";

test("creates and extends a notebook", async () => {
  const root = await mkdtemp(join(tmpdir(), "loom-test-"));
  await beginNotebook(root, { path: "notes/session.md", title: "Vectors" });
  await addNotebookEntry(root, {
    path: "notes/session.md",
    kind: "insight",
    body: "Direction and magnitude belong together.",
  });
  const text = await readFile(join(root, "notes/session.md"), "utf8");
  assert.match(text, /# Vectors/);
  assert.match(text, /KEY CONNECTION/);
});

test("rejects notebook paths outside the workspace", () => {
  assert.throws(() => resolveNotebookPath("/tmp/work", "../outside.md"), /inside the working directory/);
});

test("rejects a directory link leading outside the workspace without writing there", async () => {
  const root = await mkdtemp(join(tmpdir(), "loom-boundary-"));
  const outside = await mkdtemp(join(tmpdir(), "loom-outside-"));
  await writeFile(join(outside, "note.md"), "untouched");
  await symlink(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(beginNotebook(root, { path: "linked/note.md", replace: true }), /inside/);
  await assert.rejects(beginNotebook(root, { path: "linked/new/deep.md" }), /inside/);
  await assert.rejects(addNotebookEntry(root, { path: "linked/note.md", kind: "insight", body: "Leak" }), /inside/);
  assert.equal(await readFile(join(outside, "note.md"), "utf8"), "untouched");
});
