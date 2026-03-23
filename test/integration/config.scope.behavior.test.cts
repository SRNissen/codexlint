import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";

const POLL_INTERVAL_MS = 50;

suite("config scope behavior", () => {
  test("getConfig prefers global values over workspace values for codexlint settings", async function () {
    this.timeout(getDefaultWaitForMs() + 10_000);

    const globalCustomCommand = `${process.execPath} /global/custom/analyzer.cjs`;
    const workspaceCustomCommand = `${process.execPath} /workspace/hostile/analyzer.cjs`;
    const globalPromptText = "GLOBAL PROMPT {{fileText}}";
    const workspacePromptText = "WORKSPACE PROMPT {{fileText}}";
    const globalSelectedSkills = ["skill-global-a", "skill-global-b"];
    const workspaceSelectedSkills = ["skill-workspace-a"];
    const globalUpdates = {
      "analyzer.command": "codexExec",
      "analyzer.customCommand": globalCustomCommand,
      "analyzer.customInput": "stdin",
      "prompt.highlightSelectedSkills": true,
      "prompt.selectedSkills": globalSelectedSkills,
      "prompt.customPrompt": true,
      "prompt.customPromptText": globalPromptText,
      "operation.enabled": true,
      "operation.debounceMs": 17,
      "operation.minFileReanalyzeMs": 23,
      "operation.maxFileBytes": 4_567,
      "operation.skipBinaryFiles": false,
      "operation.timeoutMs": 8_901,
      "operation.showDebugIO": true
    } as const;
    const workspaceUpdates = {
      "analyzer.command": "claudeP",
      "analyzer.customCommand": workspaceCustomCommand,
      "analyzer.customInput": "arg",
      "prompt.highlightSelectedSkills": false,
      "prompt.selectedSkills": workspaceSelectedSkills,
      "prompt.customPrompt": false,
      "prompt.customPromptText": workspacePromptText,
      "operation.enabled": false,
      "operation.debounceMs": 31_536_000_000,
      "operation.minFileReanalyzeMs": 31_536_000_000,
      "operation.maxFileBytes": 1,
      "operation.skipBinaryFiles": true,
      "operation.timeoutMs": 1,
      "operation.showDebugIO": false
    } as const;

    await withGlobalCodexlintConfig(globalUpdates, async () => {
      await withWorkspaceCodexlintSettings(workspaceUpdates, async () => {
        const { getConfig } = await import("../../src/shared.js");
        const resolved = getConfig();

        assert.equal(resolved.enabled, globalUpdates["operation.enabled"]);
        assert.equal(resolved.debounceMs, globalUpdates["operation.debounceMs"]);
        assert.equal(resolved.minFileReanalyzeMs, globalUpdates["operation.minFileReanalyzeMs"]);
        assert.equal(resolved.maxFileBytes, globalUpdates["operation.maxFileBytes"]);
        assert.equal(resolved.skipBinaryFiles, globalUpdates["operation.skipBinaryFiles"]);
        assert.equal(resolved.showDebugIO, globalUpdates["operation.showDebugIO"]);
        assert.equal(resolved.analysisCommand, "codex");
        assert.deepEqual(resolved.analysisArgs, ["exec", "--sandbox", "read-only"]);
        assert.equal(resolved.promptTransport, "arg");
        assert.equal(resolved.promptTemplate, globalPromptText);
        assert.deepEqual(resolved.selectedSkills, ["skill-global-a", "skill-global-b"]);
        assert.equal(resolved.timeoutMs, globalUpdates["operation.timeoutMs"]);
      });
    });
  });

  test("prefers global built-in analyzer preset over workspace analyzer preset", async function () {
    this.timeout(getDefaultWaitForMs() + 10_000);

    await withGlobalCodexlintConfig({ "analyzer.command": "codexExec" }, async () => {
      await withWorkspaceCodexlintSettings({ "analyzer.command": "claudeP" }, async () => {
        const { getConfig } = await import("../../src/shared.js");
        const resolved = getConfig();

        assert.equal(
          resolved.analysisCommand,
          "codex",
          "expected the global built-in analyzer preset to win over the workspace preset"
        );
        assert.deepEqual(
          resolved.analysisArgs,
          ["exec", "--sandbox", "read-only"],
          "expected the global codex preset args to be preserved"
        );
        assert.equal(resolved.promptTransport, "arg");
      });
    });
  });

  test("prefers global timeout over workspace timeout for analyzer execution", async function () {
    this.timeout(getDefaultWaitForMs() + 10_000);

    const workspacePath = getWorkspacePath();
    const scriptPath = path.join(workspacePath, "scope-timeout-analyzer.cjs");
    const filePath = path.join(workspacePath, "scope-timeout-target.ts");
    const fileUri = vscode.Uri.file(filePath);

    await writeDelayedAnalyzerScript(scriptPath, 100, "global-timeout-finding");
    await writeFile(filePath, "const value = 1;\n", "utf8");

    await withGlobalCodexlintConfig(
      {
        "analyzer.command": "custom",
        "analyzer.customCommand": buildCustomCommand(scriptPath),
        "analyzer.customInput": "stdin",
        "operation.timeoutMs": 5_000
      },
      async () => {
        await withWorkspaceCodexlintSettings(
          {
            "operation.enabled": true,
            "operation.debounceMs": 0,
            "operation.minFileReanalyzeMs": 0,
            "operation.showDebugIO": false,
            "operation.timeoutMs": 1
          },
          async () => {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await appendAndSave(document, "// save trigger timeout scope\n");

            await waitForAnalysisCycle(fileUri);

            const diagnostics = getCodexlintDiagnostics(fileUri);
            assert.ok(
              diagnostics.some((entry) => entry.code === "global-timeout-finding"),
              "expected the user/global timeout to apply so the analyzer can return findings"
            );
            assert.equal(
              diagnostics.some((entry) => entry.code === "analysis-command-failed"),
              false,
              "expected the workspace timeout setting to be ignored"
            );
          }
        );
      }
    );
  });
});

function getWorkspacePath(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "expected a workspace folder");
  return workspaceFolder.uri.fsPath;
}

function buildCustomCommand(scriptPath: string, counterPath?: string): string {
  const args = [process.execPath, scriptPath];
  if (counterPath !== undefined) {
    args.push(counterPath);
  }
  return args.map(quoteArg).join(" ");
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}

async function writeDelayedAnalyzerScript(
  scriptPath: string,
  delayMs: number,
  findingCode: string
): Promise<void> {
  await writeFile(
    scriptPath,
    [
      "setTimeout(() => {",
      "  process.stdout.write(JSON.stringify({ findings: [",
      "    {",
      `      message: ${JSON.stringify(`${findingCode} message`)},`,
      "      severity: 'warning',",
      "      line: 1,",
      "      column: 1,",
      "      endLine: 1,",
      "      endColumn: 8,",
      `      code: ${JSON.stringify(findingCode)}`,
      "    }",
      "  ] }));",
      `}, ${delayMs});`
    ].join("\n"),
    "utf8"
  );
}

async function appendAndSave(document: vscode.TextDocument, appendText: string): Promise<void> {
  const editor = await vscode.window.showTextDocument(document);
  const applied = await editor.edit((editBuilder) => {
    const lastLine = Math.max(0, document.lineCount - 1);
    const endCharacter = document.lineAt(lastLine).text.length;
    editBuilder.insert(new vscode.Position(lastLine, endCharacter), appendText);
  });
  assert.equal(applied, true, "expected text edit to apply");
  const saved = await document.save();
  assert.equal(saved, true, "expected document save to succeed");
}

async function waitForAnalysisCycle(fileUri: vscode.Uri): Promise<void> {
  await waitFor(() =>
    getCodexlintDiagnostics(fileUri).some((diagnostic) => diagnostic.code === "analysis-in-progress")
  );
  await waitFor(() =>
    getCodexlintDiagnostics(fileUri).every((diagnostic) => diagnostic.code !== "analysis-in-progress")
  );
}

function getCodexlintDiagnostics(fileUri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages
    .getDiagnostics(fileUri)
    .filter((diagnostic) => diagnostic.source === "codexlint");
}

async function withGlobalCodexlintConfig(
  updates: Record<string, unknown>,
  fn: () => Promise<void>
): Promise<void> {
  const config = vscode.workspace.getConfiguration("codexlint");
  const keys = Object.keys(updates);
  const previousValues = new Map<string, unknown>();

  for (const key of keys) {
    previousValues.set(key, config.inspect(key)?.globalValue);
  }

  try {
    for (const [key, value] of Object.entries(updates)) {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    }
    await waitForGlobalCodexlintValues(updates);
    await fn();
  } finally {
    for (const key of keys) {
      const previous = previousValues.get(key);
      await config.update(key, previous, vscode.ConfigurationTarget.Global);
    }

    const restoredValues = Object.fromEntries(
      keys.map((key) => [key, previousValues.get(key)])
    );
    await waitForGlobalCodexlintValues(restoredValues);
  }
}

async function withWorkspaceCodexlintSettings(
  updates: Record<string, unknown>,
  fn: () => Promise<void>
): Promise<void> {
  const workspacePath = getWorkspacePath();
  const vscodeDir = path.join(workspacePath, ".vscode");
  const settingsPath = path.join(vscodeDir, "settings.json");
  const fullUpdates = Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [`codexlint.${key}`, value])
  );

  let previousRaw: string | undefined;
  try {
    previousRaw = await readFile(settingsPath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }

  const previousSettings = previousRaw === undefined
    ? {}
    : JSON.parse(previousRaw) as Record<string, unknown>;
  const nextSettings = { ...previousSettings, ...fullUpdates };

  try {
    await mkdir(vscodeDir, { recursive: true });
    await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
    await waitForWorkspaceCodexlintValues(updates);
    await fn();
  } finally {
    if (previousRaw === undefined) {
      await rm(settingsPath, { force: true });
    } else {
      await writeFile(settingsPath, previousRaw, "utf8");
    }

    const restoredValues = Object.fromEntries(
      Object.keys(updates).map((key) => [key, previousSettings[`codexlint.${key}`]])
    );
    await waitForWorkspaceCodexlintValues(restoredValues);
  }
}

async function waitForGlobalCodexlintValues(expected: Record<string, unknown>): Promise<void> {
  await waitFor(() => {
    const config = vscode.workspace.getConfiguration("codexlint");
    return Object.entries(expected).every(([key, value]) =>
      matchesExpectedValue(config.inspect(key)?.globalValue, value)
    );
  });
}

async function waitForWorkspaceCodexlintValues(expected: Record<string, unknown>): Promise<void> {
  await waitFor(() => {
    const config = vscode.workspace.getConfiguration("codexlint");
    return Object.entries(expected).every(([key, value]) =>
      matchesExpectedValue(config.inspect(key)?.workspaceValue, value)
    );
  });
}

function matchesExpectedValue(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs?: number): Promise<void> {
  const effectiveTimeoutMs = timeoutMs ?? getDefaultWaitForMs();
  const start = Date.now();
  while (Date.now() - start <= effectiveTimeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`timed out after ${effectiveTimeoutMs}ms waiting for condition`);
}

function getDefaultWaitForMs(): number {
  const linterTimeoutMs = vscode.workspace
    .getConfiguration("codexlint")
    .get<number>("operation.timeoutMs", 120_000);
  return Math.max(0, linterTimeoutMs) + 5_000;
}
