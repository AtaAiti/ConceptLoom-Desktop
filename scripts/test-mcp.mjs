import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Newer Node releases also discover desktop TypeScript tests, which need Vitest.
// Pass MCP test files explicitly without relying on shell glob expansion on Windows.
const root = new URL("../", import.meta.url);
const directory = new URL("test/", root);
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(fileURLToPath(directory), name));
if (!files.length) throw new Error("No MCP tests found.");
const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], {
  cwd: fileURLToPath(root),
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
