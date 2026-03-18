import { defineConfig } from "@vscode/test-cli";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(__dirname);

export default defineConfig({
  extensionDevelopmentPath: repoRoot,
  files: "../out/test/**/*.test.cjs",
  version: "1.111.0",
  workspaceFolder: "../test-workspace",
  launchArgs: ["--disable-extensions", "--disable-gpu"],
  mocha: {
    timeout: 20_000
  }
});
