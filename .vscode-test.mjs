import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/**/*.test.cjs",
  version: "1.111.0",
  workspaceFolder: "./test-workspace",
  launchArgs: ["--disable-extensions", "--disable-gpu"],
  mocha: {
    timeout: 20_000
  }
});
