import { appendFile, mkdir, readFile, writeFile, realpath, lstat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const permittedKinds = new Set(["learner", "guide", "prompt", "response", "insight", "diagram"]);

function ensureInside(root, target) {
  const rel = relative(root, target);
  if (rel === "" || (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel)))
    return target;
  throw new Error("notebook path must stay inside the working directory");
}

export async function validateRealPath(baseDirectory, destination) {
  const root = await realpath(baseDirectory);
  let ancestor = destination;
  for (;;) {
    try {
      ensureInside(root, await realpath(ancestor));
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const entry = await lstat(ancestor).catch((e) => {
        if (e?.code !== "ENOENT") throw e;
        return null;
      });
      if (entry?.isSymbolicLink()) throw new Error("notebook path must stay inside the working directory");
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}

export function resolveNotebookPath(baseDirectory, requested = "learning-notes.md") {
  const root = resolve(baseDirectory);
  const destination = resolve(root, requested);
  return ensureInside(root, destination);
}

function blockFor(kind, body, title) {
  const text = String(body ?? "").trim();
  if (!text) throw new Error("body must be non-empty");
  const labels = {
    learner: "LEARNER",
    guide: "GUIDE",
    prompt: "CHECKPOINT",
    response: "CHECKPOINT RESULT",
    insight: "KEY CONNECTION",
    diagram: "DIAGRAM",
  };
  const heading = title?.trim() || labels[kind];
  return `> [!${kind === "response" ? "success" : kind === "prompt" ? "question" : "note"}] ${heading}\n>\n${text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}`;
}

export async function beginNotebook(baseDirectory, input) {
  const destination = resolveNotebookPath(baseDirectory, input.path);
  await validateRealPath(baseDirectory, destination);
  await mkdir(dirname(destination), { recursive: true });
  await validateRealPath(baseDirectory, destination);
  const heading = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Learning session";
  const preamble = `# ${heading}\n\n_Created by Concept Loom on ${new Date().toISOString()}_\n`;
  if (input.replace === true) {
    await writeFile(destination, preamble, "utf8");
  } else {
    try {
      const existing = await readFile(destination, "utf8");
      if (!existing.trim()) await writeFile(destination, preamble, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await writeFile(destination, preamble, "utf8");
    }
  }
  return destination;
}

export async function addNotebookEntry(baseDirectory, input) {
  const destination = resolveNotebookPath(baseDirectory, input.path);
  await validateRealPath(baseDirectory, destination);
  const kind = String(input.kind ?? "");
  if (!permittedKinds.has(kind)) throw new Error(`kind must be one of: ${[...permittedKinds].join(", ")}`);
  await appendFile(destination, `\n${blockFor(kind, input.body, input.title)}\n`, "utf8");
  return destination;
}
