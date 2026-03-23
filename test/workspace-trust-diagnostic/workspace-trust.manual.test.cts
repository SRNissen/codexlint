import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as vscode from "vscode";

const MANUAL_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 50;
const CUSTOM_BLOCK_WINDOW_MS = 2_000;
const DIAGNOSTIC_CHANNEL_NAME = "workspace trust diagnostic";

suite("workspace trust manual diagnostic", () => {
  let fakeBinDir: string | undefined;
  let fakeAnalyzerImplPath: string | undefined;
  const originalPath = process.env.PATH;
  const originalCounterPath = process.env.CODEXLINT_TEST_COUNTER_PATH;
  const originalFindingCode = process.env.CODEXLINT_TEST_FINDING_CODE;
  const originalFindingMessage = process.env.CODEXLINT_TEST_FINDING_MESSAGE;

  suiteSetup(async function () {
    this.timeout(MANUAL_TIMEOUT_MS);

    fakeBinDir = await mkdtemp(path.join(os.tmpdir(), "codexlint-workspace-trust-"));
    fakeAnalyzerImplPath = path.join(fakeBinDir, "fake-analyzer.cjs");

    await writeFakeAnalyzerImplementation(fakeAnalyzerImplPath);
    await installBuiltinShim(fakeBinDir, "codex", fakeAnalyzerImplPath);
    await installBuiltinShim(fakeBinDir, "claude", fakeAnalyzerImplPath);

    process.env.PATH = [fakeBinDir, originalPath].filter(isDefined).join(path.delimiter);
  });

  suiteTeardown(async () => {
    restoreScenarioEnv({
      originalCounterPath,
      originalFindingCode,
      originalFindingMessage
    });
    process.env.PATH = originalPath;

    if (fakeBinDir !== undefined) {
      await rm(fakeBinDir, { recursive: true, force: true });
    }
  });

  teardown(() => {
    restoreScenarioEnv({
      originalCounterPath,
      originalFindingCode,
      originalFindingMessage
    });
  });

  test("enforces the analyzer trust matrix across a manual trust grant", async function () {
    this.timeout(MANUAL_TIMEOUT_MS);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, "expected a workspace folder");

    const extension = vscode.extensions.getExtension("SRNissen.codexlint");
    assert.ok(extension, "expected codexlint extension to be installed for tests");
    await extension.activate();
    assert.equal(extension.isActive, true, "expected codexlint extension to be active");

    const fakeAnalyzerPath = requireFakeAnalyzerImplPath(fakeAnalyzerImplPath);
    const output = vscode.window.createOutputChannel(DIAGNOSTIC_CHANNEL_NAME);

    try {
      output.appendLine(`[diagnostic] workspace path: ${workspaceFolder.uri.fsPath}`);
      output.appendLine(`[diagnostic] initial workspace.isTrusted=${vscode.workspace.isTrusted}`);
      output.appendLine("[diagnostic] phase 1: verify Restricted Mode analyzer behavior");
      output.show(true);

      assert.equal(
        vscode.workspace.isTrusted,
        false,
        "expected this diagnostic to start in an untrusted workspace"
      );

      await assertAnalyzerBehavior({
        analyzerCommand: "codexExec",
        expectedResult: "lints",
        fakeAnalyzerImplPath: fakeAnalyzerPath,
        output,
        phase: "untrusted"
      });
      await assertAnalyzerBehavior({
        analyzerCommand: "claudeP",
        expectedResult: "lints",
        fakeAnalyzerImplPath: fakeAnalyzerPath,
        output,
        phase: "untrusted"
      });
      await assertAnalyzerBehavior({
        analyzerCommand: "custom",
        expectedResult: "blocked",
        fakeAnalyzerImplPath: fakeAnalyzerPath,
        output,
        phase: "untrusted"
      });

      output.appendLine("[diagnostic] phase 2: trust the workspace now");
      void vscode.window.showInformationMessage(
        "Manual diagnostic: trust this workspace now using the Restricted Mode UI or the Workspace Trust command."
      );

      await waitForWorkspaceTrustGrant(output, MANUAL_TIMEOUT_MS - 60_000);

      output.appendLine("[diagnostic] phase 3: verify trusted analyzer behavior");
      await assertAnalyzerBehavior({
        analyzerCommand: "codexExec",
        expectedResult: "lints",
        fakeAnalyzerImplPath: fakeAnalyzerPath,
        output,
        phase: "trusted"
      });
      await assertAnalyzerBehavior({
        analyzerCommand: "claudeP",
        expectedResult: "lints",
        fakeAnalyzerImplPath: fakeAnalyzerPath,
        output,
        phase: "trusted"
      });
      await assertAnalyzerBehavior({
        analyzerCommand: "custom",
        expectedResult: "lints",
        fakeAnalyzerImplPath: fakeAnalyzerPath,
        output,
        phase: "trusted"
      });
    } finally {
      output.dispose();
    }
  });
});

async function assertAnalyzerBehavior(options: {
  analyzerCommand: "codexExec" | "claudeP" | "custom";
  expectedResult: "lints" | "blocked";
  fakeAnalyzerImplPath: string;
  output: vscode.OutputChannel;
  phase: "trusted" | "untrusted";
}): Promise<void> {
  const workspacePath = getWorkspacePath();
  const fileStem = `${options.phase}-${options.analyzerCommand}`;
  const counterPath = path.join(workspacePath, `${fileStem}.count`);
  const filePath = path.join(workspacePath, `${fileStem}.ts`);
  const fileUri = vscode.Uri.file(filePath);
  const findingCode = `workspace-trust-${fileStem}`;
  const blockedCode = "custom-analyzer-requires-trusted-workspace";
  const updates: Record<string, unknown> = {
    "analyzer.command": options.analyzerCommand,
    "analyzer.customCommand": "",
    "analyzer.customInput": "stdin",
    "operation.enabled": true,
    "operation.debounceMs": 0,
    "operation.minFileReanalyzeMs": 0,
    "operation.timeoutMs": 5_000,
    "operation.showDebugIO": false
  };

  if (options.analyzerCommand === "custom") {
    updates["analyzer.customCommand"] = buildCustomCommand(options.fakeAnalyzerImplPath);
  }

  await writeFile(counterPath, "0", "utf8");
  await writeFile(filePath, "const value = 1;\n", "utf8");
  configureFakeAnalyzerProbe({
    counterPath,
    findingCode,
    findingMessage: `${options.phase} ${options.analyzerCommand} finding`
  });

  options.output.appendLine(
    `[diagnostic] checking ${options.phase}/${options.analyzerCommand}; expectedResult=${options.expectedResult}`
  );

  await withCodexlintConfig(updates, async () => {
    const document = await vscode.workspace.openTextDocument(fileUri);
    await appendAndSave(document, `// save trigger ${fileStem}\n`);

    if (options.expectedResult === "lints") {
      await waitFor(() => hasCounterReached(counterPath, 1));
      await waitFor(() => hasDiagnosticCode(fileUri, findingCode));
      options.output.appendLine(`[diagnostic] observed lint for ${options.phase}/${options.analyzerCommand}`);
      return;
    }

    await assertCounterDoesNotIncrease(counterPath, 0, CUSTOM_BLOCK_WINDOW_MS);
    await waitFor(() => hasDiagnosticCode(fileUri, blockedCode));

    const blockedDiagnostic = getCodexlintDiagnostics(fileUri).find(
      (diagnostic) => diagnostic.code === blockedCode
    );
    assert.ok(
      blockedDiagnostic,
      `expected a trust warning diagnostic for ${options.phase}/${options.analyzerCommand}`
    );
    assert.equal(
      blockedDiagnostic.severity,
      vscode.DiagnosticSeverity.Information,
      `expected an informational diagnostic for ${options.phase}/${options.analyzerCommand}`
    );
    assert.match(
      blockedDiagnostic.message,
      /trusted workspace/i,
      `expected the diagnostic to explain the workspace trust requirement for ${options.phase}/${options.analyzerCommand}`
    );
    assert.equal(
      hasDiagnosticCode(fileUri, findingCode),
      false,
      `expected no analyzer findings for ${options.phase}/${options.analyzerCommand}`
    );
    options.output.appendLine(
      `[diagnostic] observed trust block for ${options.phase}/${options.analyzerCommand}`
    );
  });
}

async function waitForWorkspaceTrustGrant(
  output: vscode.OutputChannel,
  timeoutMs: number
): Promise<void> {
  if (vscode.workspace.isTrusted) {
    output.appendLine("[diagnostic] workspace was already trusted before waiting");
    return;
  }

  output.appendLine("[diagnostic] waiting for vscode.workspace.onDidGrantWorkspaceTrust...");

  await new Promise<void>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      disposable.dispose();
      reject(
        new Error(
          `timed out after ${timeoutMs}ms waiting for a manual workspace trust grant`
        )
      );
    }, timeoutMs);

    const disposable = vscode.workspace.onDidGrantWorkspaceTrust(async () => {
      clearTimeout(timeoutHandle);
      disposable.dispose();
      output.appendLine("[diagnostic] received vscode.workspace.onDidGrantWorkspaceTrust");
      try {
        await waitFor(() => vscode.workspace.isTrusted, 5_000);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function getWorkspacePath(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "expected a workspace folder");
  return workspaceFolder.uri.fsPath;
}

function requireFakeAnalyzerImplPath(fakeAnalyzerImplPath: string | undefined): string {
  assert.ok(fakeAnalyzerImplPath, "expected fake analyzer implementation path to be initialized");
  return fakeAnalyzerImplPath;
}

async function writeFakeAnalyzerImplementation(scriptPath: string): Promise<void> {
  await writeFile(
    scriptPath,
    [
      "const fs = require('node:fs');",
      "const counterPath = process.env.CODEXLINT_TEST_COUNTER_PATH;",
      "const findingCode = process.env.CODEXLINT_TEST_FINDING_CODE || 'workspace-trust-finding';",
      "const findingMessage = process.env.CODEXLINT_TEST_FINDING_MESSAGE || findingCode;",
      "if (!counterPath) {",
      "  console.error('CODEXLINT_TEST_COUNTER_PATH is required');",
      "  process.exit(2);",
      "}",
      "let count = 0;",
      "try {",
      "  count = Number(fs.readFileSync(counterPath, 'utf8')) || 0;",
      "} catch {}",
      "fs.writeFileSync(counterPath, String(count + 1), 'utf8');",
      "process.stdout.write(JSON.stringify({ findings: [",
      "  {",
      "    message: findingMessage,",
      "    severity: 'warning',",
      "    line: 1,",
      "    column: 1,",
      "    endLine: 1,",
      "    endColumn: 8,",
      "    code: findingCode",
      "  }",
      "] }));"
    ].join("\n"),
    "utf8"
  );
}

async function installBuiltinShim(
  binDir: string,
  commandName: string,
  analyzerImplPath: string
): Promise<void> {
  if (process.platform === "win32") {
    const shimPath = path.join(binDir, `${commandName}.cmd`);
    await writeFile(
      shimPath,
      `@echo off\r\n"${process.execPath}" "${analyzerImplPath}" %*\r\n`,
      "utf8"
    );
    return;
  }

  const shimPath = path.join(binDir, commandName);
  await writeFile(
    shimPath,
    `#!/usr/bin/env sh
exec "${escapeForDoubleQuotes(process.execPath)}" "${escapeForDoubleQuotes(analyzerImplPath)}" "$@"
`,
    "utf8"
  );
  await chmod(shimPath, 0o755);
}

function escapeForDoubleQuotes(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function configureFakeAnalyzerProbe(options: {
  counterPath: string;
  findingCode: string;
  findingMessage: string;
}): void {
  process.env.CODEXLINT_TEST_COUNTER_PATH = options.counterPath;
  process.env.CODEXLINT_TEST_FINDING_CODE = options.findingCode;
  process.env.CODEXLINT_TEST_FINDING_MESSAGE = options.findingMessage;
}

function restoreScenarioEnv(options: {
  originalCounterPath: string | undefined;
  originalFindingCode: string | undefined;
  originalFindingMessage: string | undefined;
}): void {
  setOrDeleteEnv("CODEXLINT_TEST_COUNTER_PATH", options.originalCounterPath);
  setOrDeleteEnv("CODEXLINT_TEST_FINDING_CODE", options.originalFindingCode);
  setOrDeleteEnv("CODEXLINT_TEST_FINDING_MESSAGE", options.originalFindingMessage);
}

function setOrDeleteEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function buildCustomCommand(scriptPath: string): string {
  return [process.execPath, scriptPath].map(quoteArg).join(" ");
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
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

async function hasCounterReached(counterPath: string, expectedMinimum: number): Promise<boolean> {
  return (await readCounter(counterPath)) >= expectedMinimum;
}

async function readCounter(counterPath: string): Promise<number> {
  try {
    return Number(await readFile(counterPath, "utf8")) || 0;
  } catch {
    return 0;
  }
}

function hasDiagnosticCode(fileUri: vscode.Uri, code: string): boolean {
  return getCodexlintDiagnostics(fileUri).some((diagnostic) => diagnostic.code === code);
}

function getCodexlintDiagnostics(fileUri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages
    .getDiagnostics(fileUri)
    .filter((diagnostic) => diagnostic.source === "codexlint");
}

async function assertCounterDoesNotIncrease(
  counterPath: string,
  baselineCount: number,
  windowMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start <= windowMs) {
    const currentCount = await readCounter(counterPath);
    if (currentCount > baselineCount) {
      throw new Error(
        `expected no analyzer invocation; baseline=${baselineCount}, current=${currentCount}`
      );
    }
    await delay(POLL_INTERVAL_MS);
  }
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

async function waitForGlobalCodexlintValues(expected: Record<string, unknown>): Promise<void> {
  await waitFor(() => {
    const config = vscode.workspace.getConfiguration("codexlint");
    return Object.entries(expected).every(([key, value]) =>
      matchesExpectedValue(config.inspect(key)?.globalValue, value)
    );
  });
}

function matchesExpectedValue(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (await check()) {
      return;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for condition`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
