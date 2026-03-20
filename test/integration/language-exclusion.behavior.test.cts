import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";

const POLL_INTERVAL_MS = 50;

suite("language exclusion behavior", () => {
  test("declares markdown and plaintext as the default excluded language IDs", async () => {
    const config = vscode.workspace.getConfiguration("codexlint");
    const useLanguageExclusions = config.inspect<boolean>("operation.useLanguageExclusions");
    const excludedLanguageIds = config.inspect<string[]>("operation.excludedLanguageIds");

    assert.equal(
      useLanguageExclusions?.defaultValue,
      true,
      "expected language exclusions to default to enabled"
    );
    assert.deepEqual(
      excludedLanguageIds?.defaultValue,
      ["markdown", "plaintext"],
      "expected markdown and plaintext to be excluded by default"
    );
  });

  test("honors excluded language IDs and the toggle when deciding whether to analyze", async function () {
    this.timeout(getDefaultWaitForMs() + 10_000);

    const workspacePath = getWorkspacePath();
    const scriptPath = path.join(workspacePath, "language-exclusion-analyzer.cjs");
    const counterPath = path.join(workspacePath, "language-exclusion-analyzer.count");
    const markdownPath = path.join(workspacePath, "language-exclusion-target.md");
    const typescriptPath = path.join(workspacePath, "language-exclusion-target.ts");
    const markdownUri = vscode.Uri.file(markdownPath);
    const typescriptUri = vscode.Uri.file(typescriptPath);

    await writeCountingAnalyzerScript(scriptPath);
    await writeFile(counterPath, "0", "utf8");
    await writeFile(markdownPath, "# heading\n", "utf8");
    await writeFile(typescriptPath, "const value = 1;\n", "utf8");

    await withCodexlintConfig(
      {
        "analyzer.command": "custom",
        "analyzer.customCommand": buildCustomCommand(scriptPath, counterPath),
        "analyzer.customInput": "stdin",
        "operation.enabled": true,
        "operation.debounceMs": 0,
        "operation.minFileReanalyzeMs": 0,
        "operation.showDebugIO": false,
        "operation.useLanguageExclusions": true,
        "operation.excludedLanguageIds": ["markdown"]
      },
      async () => {
        const markdownDocument = await vscode.workspace.openTextDocument(markdownUri);
        const typescriptDocument = await vscode.workspace.openTextDocument(typescriptUri);

        assert.equal(markdownDocument.languageId, "markdown");
        assert.equal(typescriptDocument.languageId, "typescript");

        await appendAndSave(markdownDocument, "\n<!-- save trigger excluded markdown -->\n");
        await assertCounterDoesNotIncrease(counterPath, 0);
        assert.deepEqual(
          getCodexlintDiagnostics(markdownUri),
          [],
          "expected excluded markdown documents not to produce diagnostics"
        );

        await appendAndSave(typescriptDocument, "\n// save trigger included typescript\n");
        await waitFor(async () => (await readCounter(counterPath)) >= 1);
        await waitFor(() =>
          getCodexlintDiagnostics(typescriptUri).some(
            (diagnostic) => diagnostic.code === "language-exclusion-finding"
          )
        );
        assert.equal(await readCounter(counterPath), 1);

        const config = vscode.workspace.getConfiguration("codexlint");
        await config.update(
          "operation.useLanguageExclusions",
          false,
          vscode.ConfigurationTarget.Global
        );
        await waitFor(
          () => config.inspect<boolean>("operation.useLanguageExclusions")?.globalValue === false
        );

        await appendAndSave(markdownDocument, "\n<!-- save trigger included markdown -->\n");
        await waitFor(async () => (await readCounter(counterPath)) >= 2);
        await waitFor(() =>
          getCodexlintDiagnostics(markdownUri).some(
            (diagnostic) => diagnostic.code === "language-exclusion-finding"
          )
        );
        assert.equal(await readCounter(counterPath), 2);

        await appendAndSave(typescriptDocument, "\n// save trigger included typescript again\n");
        await waitFor(async () => (await readCounter(counterPath)) >= 3);
        assert.equal(await readCounter(counterPath), 3);
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
      "    message: 'language exclusion finding',",
      "    severity: 'warning',",
      "    line: 1,",
      "    column: 1,",
      "    endLine: 1,",
      "    endColumn: 8,",
      "    code: 'language-exclusion-finding'",
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
        `expected no analyzer invocation for excluded language; baseline=${baselineCount}, current=${currentCount}`
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
