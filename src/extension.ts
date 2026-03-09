import * as vscode from "vscode";
import { spawn } from "node:child_process";

const DIAGNOSTIC_SOURCE = "codexlint";
const DEFAULT_DEBOUNCE_MS = 750;
const DEFAULT_MAX_FILE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const BINARY_SCAN_CHARS = 8_192;
const DEBUG_ENV_COMMAND_ID = "codexlint.debugEnvironment";


interface CodexLintConfig {
  enabled: boolean;
  debounceMs: number;
  maxFileBytes: number;
  skipBinaryFiles: boolean;
  codexCommand: string;
  codexArgs: string[];
  timeoutMs: number;
}

interface CodexFinding {
  message: string;
  severity: vscode.DiagnosticSeverity;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  code: string | number | undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("codexlint");
  const output = vscode.window.createOutputChannel("codexlint");
  const pendingByUri = new Map<string, ReturnType<typeof setTimeout>>();
  const runSequenceByUri = new Map<string, number>();

  const debugEnvironmentCommand = vscode.commands.registerCommand(DEBUG_ENV_COMMAND_ID, () => {
    const pathValue = process.env.PATH ?? "(undefined)";
    const executablePath = process.execPath;
    const codexCommand = getConfig().codexCommand;
    const nodePath = process.env.NODE ?? "(undefined)";
    const lookupCommand = process.platform === "win32" ? "where" : "which";

    output.appendLine("[codexlint] Extension Host environment diagnostics");
    output.appendLine(`[codexlint] process.execPath=${executablePath}`);
    output.appendLine(`[codexlint] PATH=${pathValue}`);
    output.appendLine(`[codexlint] NODE=${nodePath}`);
    output.appendLine(`[codexlint] configured codex command=${codexCommand}`);

    void runProcessWithTimeout({
      command: lookupCommand,
      args: ["node"],
      stdin: "",
      timeoutMs: 3_000,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    })
      .then((stdout) => {
        output.appendLine(`[codexlint] ${lookupCommand} node => ${stdout.trim() || "(not found)"}`);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`[codexlint] ${lookupCommand} node failed => ${message}`);
      });

    void runProcessWithTimeout({
      command: lookupCommand,
      args: [codexCommand],
      stdin: "",
      timeoutMs: 3_000,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    })
      .then((stdout) => {
        output.appendLine(
          `[codexlint] ${lookupCommand} ${codexCommand} => ${stdout.trim() || "(not found)"}`
        );
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`[codexlint] ${lookupCommand} ${codexCommand} failed => ${message}`);
      });

    output.show(true);
  });

  const saveHandler = vscode.workspace.onDidSaveTextDocument((document) => {
    const cfg = getConfig();
    if (!cfg.enabled) {
      return;
    }

    const uriKey = document.uri.toString();
    const nextSequence = (runSequenceByUri.get(uriKey) ?? 0) + 1;
    runSequenceByUri.set(uriKey, nextSequence);

    const existingDebounce = pendingByUri.get(uriKey);
    if (existingDebounce !== undefined) {
      clearTimeout(existingDebounce);
    }

    const debounceHandle = setTimeout(() => {
      pendingByUri.delete(uriKey);
      void analyzeSavedDocument(document, nextSequence, runSequenceByUri, diagnostics, output);
    }, Math.max(0, cfg.debounceMs));

    pendingByUri.set(uriKey, debounceHandle);
  });

  const timerCleanup = {
    dispose: () => {
      for (const handle of pendingByUri.values()) {
        clearTimeout(handle);
      }
      pendingByUri.clear();
    }
  };

  context.subscriptions.push(
    diagnostics,
    output,
    debugEnvironmentCommand,
    saveHandler,
    timerCleanup
  );
}

export function deactivate(): void {}

function getConfig(): CodexLintConfig {
  const config = vscode.workspace.getConfiguration("codexlint");
  const codexArgs = config.get<string[]>("codex.args", ["exec"]);
  return {
    enabled: config.get<boolean>("onSave.enabled", true),
    debounceMs: config.get<number>("onSave.debounceMs", DEFAULT_DEBOUNCE_MS),
    maxFileBytes: config.get<number>("onSave.maxFileBytes", DEFAULT_MAX_FILE_BYTES),
    skipBinaryFiles: config.get<boolean>("onSave.skipBinaryFiles", true),
    codexCommand: config.get<string>("codex.command", "codex"),
    codexArgs: Array.isArray(codexArgs) ? codexArgs : ["exec"],
    timeoutMs: config.get<number>("codex.timeoutMs", DEFAULT_TIMEOUT_MS)
  };
}

async function analyzeSavedDocument(
  document: vscode.TextDocument,
  runSequence: number,
  runSequenceByUri: Map<string, number>,
  diagnostics: vscode.DiagnosticCollection,
  output: vscode.OutputChannel
): Promise<void> {
  const cfg = getConfig();
  const uriKey = document.uri.toString();

  if (!shouldAnalyze(document, cfg)) {
    diagnostics.delete(document.uri);
    return;
  }

  diagnostics.set(document.uri, [createAnalyzingDiagnostic(document)]);

  try {
    const prompt = buildPrompt(document);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder?.uri.fsPath;
    const stdout = await runProcessWithTimeout({
      command: cfg.codexCommand,
      args: [...cfg.codexArgs, prompt],
      stdin: prompt,
      timeoutMs: cfg.timeoutMs,
      cwd
    });
    const findings = parseFindings(stdout);

    if (runSequenceByUri.get(uriKey) !== runSequence) {
      return;
    }

    const nextDiagnostics = findings.map((finding) => toDiagnostic(document, finding));
    if (nextDiagnostics.length === 0) {
      diagnostics.delete(document.uri);
      return;
    }

    diagnostics.set(document.uri, nextDiagnostics);
  } catch (error) {
    if (runSequenceByUri.get(uriKey) !== runSequence) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[codexlint] ${document.uri.fsPath}: ${message}`);

    const diagnostic = new vscode.Diagnostic(
      testDiagnosticRange(document),
      `codexlint failed to run codex exec: ${message}`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = "codex-exec-failed";
    diagnostics.set(document.uri, [diagnostic]);
  }
}

function shouldAnalyze(document: vscode.TextDocument, cfg: CodexLintConfig): boolean {
  if (document.uri.scheme !== "file") {
    return false;
  }

  const text = document.getText();
  if (text.length === 0) {
    return false;
  }

  if (Buffer.byteLength(text, "utf8") > cfg.maxFileBytes) {
    return false;
  }

  if (!cfg.skipBinaryFiles) {
    return true;
  }

  const sample = text.slice(0, BINARY_SCAN_CHARS);
  return !sample.includes("\u0000");
}

function buildPrompt(document: vscode.TextDocument): string {
  const filePath = document.uri.fsPath;
  const fileLanguage = document.languageId;
  const fileText = document.getText();

  return [
    "You are a static security reviewer for a single source file.",
    "Analyze only the file content provided below.",
    "Return JSON only.",
    "Output schema:",
    "{",
    '  "findings": [',
    "    {",
    '      "message": "string",',
    '      "severity": "error|warning|info",',
    '      "line": 1,',
    '      "column": 1,',
    '      "endLine": 1,',
    '      "endColumn": 1,',
    "    }",
    "  ]",
    "}",
    "",
    `File path: ${filePath}`,
    `Language: ${fileLanguage}`,
    "File content:",
    fileText
  ].join("\n");
}

function runProcessWithTimeout(options: {
  command: string;
  args: string[];
  stdin: string;
  timeoutMs: number;
  cwd: string | undefined;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, Math.max(1, options.timeoutMs));

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new Error(`codex exec timed out after ${options.timeoutMs}ms`));
        return;
      }

      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`codex exec failed: ${detail}`));
        return;
      }

      resolve(stdout);
    });

    child.stdin.write(options.stdin);
    child.stdin.end();
  });
}

function parseFindings(rawOutput: string): CodexFinding[] {
  const parsed = parseJsonLenient(rawOutput);

  let findingObjects: unknown[] = [];
  if (Array.isArray(parsed)) {
    findingObjects = parsed;
  } else if (isRecord(parsed) && Array.isArray(parsed.findings)) {
    findingObjects = parsed.findings;
  } else {
    throw new Error("codex exec output did not match expected findings schema");
  }

  const findings: CodexFinding[] = [];
  for (const entry of findingObjects) {
    const finding = normalizeFinding(entry);
    if (finding !== null) {
      findings.push(finding);
    }
  }

  return findings;
}

function normalizeFinding(value: unknown): CodexFinding | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.message !== "string" || value.message.trim().length === 0) {
    return null;
  }

  const line = toPositiveInt(value.line, 1);
  const column = toPositiveInt(value.column, 1);
  const endLine = toPositiveInt(value.endLine, line);
  const endColumn = toPositiveInt(value.endColumn, column + 1);
  const severity = parseSeverity(value.severity);
  const code =
    typeof value.code === "string" || typeof value.code === "number" ? value.code : undefined;

  return {
    message: value.message.trim(),
    severity,
    line,
    column,
    endLine,
    endColumn,
    code
  };
}

function parseSeverity(value: unknown): vscode.DiagnosticSeverity {
  if (value === "error") {
    return vscode.DiagnosticSeverity.Error;
  }
  if (value === "warning") {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : fallback;
}

function parseJsonLenient(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("codex exec returned empty output");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fallback parsers.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const fencedJson = fenced?.[1];
  if (typeof fencedJson === "string") {
    try {
      return JSON.parse(fencedJson);
    } catch {
      // Continue to fallback parsers.
    }
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    } catch {
      // Continue to fallback parsers.
    }
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
    } catch {
      // Continue to final error.
    }
  }

  throw new Error("codex exec returned non-JSON output");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toDiagnostic(document: vscode.TextDocument, finding: CodexFinding): vscode.Diagnostic {
  const range = toRange(document, finding);
  const diagnostic = new vscode.Diagnostic(range, finding.message, finding.severity);
  diagnostic.source = DIAGNOSTIC_SOURCE;
  if (finding.code !== undefined) {
    diagnostic.code = finding.code;
  }
  return diagnostic;
}

function createAnalyzingDiagnostic(document: vscode.TextDocument): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    testDiagnosticRange(document),
    "codexlint is analyzing this file for security issues...",
    vscode.DiagnosticSeverity.Information
  );
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = "analysis-in-progress";
  return diagnostic;
}

function toRange(document: vscode.TextDocument, finding: CodexFinding): vscode.Range {
  const maxLine = Math.max(0, document.lineCount - 1);
  const startLine = clamp(finding.line - 1, 0, maxLine);
  const endLine = clamp(finding.endLine - 1, startLine, maxLine);
  const startCharacter = clampColumn(document, startLine, finding.column - 1);
  const endCharacterCandidate = clampColumn(document, endLine, finding.endColumn - 1);
  const endCharacter =
    endLine === startLine && endCharacterCandidate <= startCharacter
      ? Math.min(startCharacter + 1, document.lineAt(startLine).text.length)
      : endCharacterCandidate;

  return new vscode.Range(startLine, startCharacter, endLine, endCharacter);
}

function clampColumn(document: vscode.TextDocument, line: number, character: number): number {
  const maxCharacter = document.lineAt(line).text.length;
  return clamp(character, 0, maxCharacter);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function testDiagnosticRange(document: vscode.TextDocument): vscode.Range {
  const firstLine = document.lineAt(0);
  const endColumn = Math.max(1, firstLine.text.length);
  return new vscode.Range(0, 0, 0, endColumn);
}
