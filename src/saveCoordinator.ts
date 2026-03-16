import * as vscode from "vscode";
import { analyzeSavedDocument } from "./analyze.js";
import { type CodexFinding, type CodexLintConfig, EXTENSION_NAME, getConfig } from "./shared.js";

const BINARY_SCAN_CHARS = 8_192;

export interface SaveResources {
  diagnostics: vscode.DiagnosticCollection;
  output: vscode.OutputChannel;
  pendingByUri: Map<string, ReturnType<typeof setTimeout>>;
  runSequenceByUri: Map<string, number>;
  lastAnalysisAtByUri: Map<string, number>;
}

export function onSave(document: vscode.TextDocument, resources: SaveResources): void {
  const cfg = getConfig();
  if (!cfg.enabled) {
    return;
  }

  const uriKey = document.uri.toString();
  const lastAnalysisAt = resources.lastAnalysisAtByUri.get(uriKey);
  if (
    lastAnalysisAt !== undefined &&
    Date.now() - lastAnalysisAt < Math.max(0, cfg.minFileReanalyzeMs)
  ) {
    return;
  }

  const nextSequence = (resources.runSequenceByUri.get(uriKey) ?? 0) + 1;
  resources.runSequenceByUri.set(uriKey, nextSequence);

  const existingDebounce = resources.pendingByUri.get(uriKey);
  if (existingDebounce !== undefined) {
    clearTimeout(existingDebounce);
  }

  const debounceHandle = setTimeout(() => {
    resources.pendingByUri.delete(uriKey);
    void runAnalysisForDocument(document, nextSequence, resources);
  }, Math.max(0, cfg.debounceMs));

  resources.pendingByUri.set(uriKey, debounceHandle);
}

async function runAnalysisForDocument(
  document: vscode.TextDocument,
  runSequence: number,
  resources: SaveResources
): Promise<void> {
  const cfg = getConfig();
  const uriKey = document.uri.toString();

  if (!shouldAnalyzeDocument(document, cfg)) {
    resources.diagnostics.delete(document.uri);
    return;
  }

  resources.lastAnalysisAtByUri.set(uriKey, Date.now());
  resources.diagnostics.set(document.uri, [createAnalyzingDiagnostic(document)]);

  try {
    const [requestTemplate, responseText, findings] = analyzeSavedDocument(document, cfg);

    if (cfg.showDebugIO) {
      void requestTemplate
        .then((requestText) => {
          if (resources.runSequenceByUri.get(uriKey) !== runSequence) {
            return;
          }
          resources.output.appendLine(
            `[${EXTENSION_NAME}] ${document.uri.fsPath}: analyzer request template (file content redacted)`
          );
          resources.output.appendLine(requestText);
        })
        .catch((error) => {
          console.error(`[${EXTENSION_NAME}] failed to log analyzer request template`, error);
        });

      void responseText
        .then((responseLogText) => {
          if (resources.runSequenceByUri.get(uriKey) !== runSequence) {
            return;
          }
          resources.output.appendLine(
            `[${EXTENSION_NAME}] ${document.uri.fsPath}: analyzer response text`
          );
          resources.output.appendLine(responseLogText);
        })
        .catch((error) => {
          console.error(`[${EXTENSION_NAME}] failed to log analyzer response text`, error);
        });
    }

    const resolvedFindings = await findings;

    if (resources.runSequenceByUri.get(uriKey) !== runSequence) {
      return;
    }

    const nextDiagnostics = resolvedFindings.map((finding) => toDiagnostic(document, finding));
    if (nextDiagnostics.length === 0) {
      resources.diagnostics.delete(document.uri);
      return;
    }

    resources.diagnostics.set(document.uri, nextDiagnostics);
  } catch (error) {
    if (resources.runSequenceByUri.get(uriKey) !== runSequence) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    resources.output.appendLine(`[${EXTENSION_NAME}] ${document.uri.fsPath}: ${message}`);

    const diagnostic = new vscode.Diagnostic(
      testDiagnosticRange(document),
      `${EXTENSION_NAME} failed to run configured analysis command: ${message}`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = EXTENSION_NAME;
    diagnostic.code = "analysis-command-failed";
    resources.diagnostics.set(document.uri, [diagnostic]);
  }
}

function shouldAnalyzeDocument(document: vscode.TextDocument, cfg: CodexLintConfig): boolean {
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

function createAnalyzingDiagnostic(document: vscode.TextDocument): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    testDiagnosticRange(document),
    `${EXTENSION_NAME} is analyzing this file for security issues...`,
    vscode.DiagnosticSeverity.Information
  );
  diagnostic.source = EXTENSION_NAME;
  diagnostic.code = "analysis-in-progress";
  return diagnostic;
}

function toDiagnostic(document: vscode.TextDocument, finding: CodexFinding): vscode.Diagnostic {
  const range = toRange(document, finding);
  const diagnostic = new vscode.Diagnostic(range, finding.message, finding.severity);
  diagnostic.source = EXTENSION_NAME;
  if (finding.code !== undefined) {
    diagnostic.code = finding.code;
  }
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
