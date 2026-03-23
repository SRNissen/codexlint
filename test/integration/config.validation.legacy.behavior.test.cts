// Legacy coverage for the pre-consistency-graph configuration model.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";

const POLL_INTERVAL_MS = 50;

suite("legacy config validation behavior", () => {
  test("legacy: blocks analysis and shows a diagnostic when the active analyzer config is invalid", async function () {
    this.timeout(getDefaultWaitForMs() + 10_000);

    const workspacePath = getWorkspacePath();
    const scriptPath = path.join(workspacePath, "invalid-config-analyzer.cjs");
    const counterPath = path.join(workspacePath, "invalid-config-analyzer.count");
    const filePath = path.join(workspacePath, "invalid-config-target.ts");
    const fileUri = vscode.Uri.file(filePath);

    await writeCountingAnalyzerScript(scriptPath);
    await writeFile(counterPath, "0", "utf8");
    await writeFile(filePath, "const value = 1;\n", "utf8");

    await withCodexlintConfig(
      {
        "analyzer.command": "custom",
        "analyzer.customCommand": buildCustomCommand(scriptPath, counterPath),
        "analyzer.customInput": "pipe",
        "operation.enabled": true,
        "operation.debounceMs": 0,
        "operation.minFileReanalyzeMs": 0,
        "operation.showDebugIO": false
      },
      async () => {
        const config = vscode.workspace.getConfiguration("codexlint");
        assert.equal(
          config.inspect<string>("analyzer.customInput")?.globalValue,
          "pipe",
          "expected the invalid custom input value to be written for the test"
        );

        const document = await vscode.workspace.openTextDocument(fileUri);
        await appendAndSave(document, "// save trigger invalid config\n");

        await assertCounterDoesNotIncrease(counterPath, 0);
        await waitFor(() =>
          getCodexlintDiagnostics(fileUri).some(
            (diagnostic) => diagnostic.code === "invalid-configuration"
          )
        );

        const configError = getCodexlintDiagnostics(fileUri).find(
          (diagnostic) => diagnostic.code === "invalid-configuration"
        );
        assert.ok(configError, "expected a codexlint configuration diagnostic");
        assert.equal(configError.severity, vscode.DiagnosticSeverity.Error);
        assert.match(configError.message, /codexlint\.analyzer\.customInput/);
        assert.match(configError.message, /Fix the setting or reset it to default/i);
        assert.equal(await readCounter(counterPath), 0, "expected analyzer not to run");
      }
    );
  });
});

function getWorkspacePath(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "expected a workspace folder");
  return workspaceFolder.uri.fsPath;
}

function buildCustomCommand(scriptPath: string, counterPath: string): string {
  return [process.execPath, scriptPath, counterPath].map(quoteArg).join(" ");
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}

async function writeCountingAnalyzerScript(scriptPath: string): Promise<void> {
  await writeFile(
    scriptPath,
    [
      "const fs = require('node:fs');",
      "const [, , counterPath] = process.argv;",
      "let count = 0;",
      "try {",
      "  count = Number(fs.readFileSync(counterPath, 'utf8')) || 0;",
      "} catch {}",
      "fs.writeFileSync(counterPath, String(count + 1), 'utf8');",
      "process.stdout.write(JSON.stringify({ findings: [",
      "  {",
      "    message: 'should not run',",
      "    severity: 'warning',",
      "    line: 1,",
      "    column: 1,",
      "    endLine: 1,",
      "    endColumn: 8,",
      "    code: 'invalid-config-counter'",
      "  }",
      "] }));"
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

async function readCounter(counterPath: string): Promise<number> {
  try {
    const value = await readFile(counterPath, "utf8");
    return Number(value) || 0;
  } catch {
    return 0;
  }
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

async function assertCounterDoesNotIncrease(
  counterPath: string,
  baselineCount: number,
  windowMs = 2_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start <= windowMs) {
    const currentCount = await readCounter(counterPath);
    if (currentCount > baselineCount) {
      throw new Error(
        `expected no analyzer invocation for invalid config; baseline=${baselineCount}, current=${currentCount}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function getDefaultWaitForMs(): number {
  const linterTimeoutMs = vscode.workspace
    .getConfiguration("codexlint")
    .get<number>("operation.timeoutMs", 120_000);
  return Math.max(0, linterTimeoutMs) + 5_000;
}

function getCodexlintDiagnostics(fileUri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages
    .getDiagnostics(fileUri)
    .filter((diagnostic) => diagnostic.source === "codexlint");
}

async function withCodexlintConfig(
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
    await fn();
  } finally {
    for (const key of keys) {
      const previous = previousValues.get(key);
      if (previous === undefined) {
        await config.update(key, undefined, vscode.ConfigurationTarget.Global);
      } else {
        await config.update(key, previous, vscode.ConfigurationTarget.Global);
      }
    }
  }
}
