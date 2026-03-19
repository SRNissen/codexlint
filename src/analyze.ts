import * as vscode from "vscode";
import {
  buildAnalysisRequest,
  parseFindings,
  type PlainFinding,
  type PlainFindingSeverity
} from "./analyzeCore.js";
import { type CodexFinding, type CodexLintConfig, runProcessWithTimeout } from "./shared.js";

export type AnalyzeSavedDocumentResult = [
  requestTemplate: Promise<string>,
  responseText: Promise<string>,
  findings: Promise<CodexFinding[]>
];

export { parseJsonLenient } from "./analyzeCore.js";

export function analyzeSavedDocument(
  document: vscode.TextDocument,
  cfg: CodexLintConfig
): AnalyzeSavedDocumentResult {
  const request = buildAnalysisRequest({
    filePath: document.uri.fsPath,
    fileLanguage: document.languageId,
    fileText: document.getText(),
    selectedSkills: cfg.selectedSkills,
    promptTemplate: cfg.promptTemplate,
    analysisArgs: cfg.analysisArgs,
    promptTransport: cfg.promptTransport
  });
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const cwd = workspaceFolder?.uri.fsPath;
  const responseText = runProcessWithTimeout({
    command: cfg.analysisCommand,
    args: request.args,
    stdin: request.stdin,
    timeoutMs: cfg.timeoutMs,
    cwd
  });
  const findings = responseText.then((output) => parseFindings(output).map(toCodexFinding));

  return [Promise.resolve(request.requestTemplate), responseText, findings];
}

function toCodexFinding(finding: PlainFinding): CodexFinding {
  return {
    message: finding.message,
    severity: toDiagnosticSeverity(finding.severity),
    line: finding.line,
    column: finding.column,
    endLine: finding.endLine,
    endColumn: finding.endColumn,
    code: finding.code
  };
}

function toDiagnosticSeverity(severity: PlainFindingSeverity): vscode.DiagnosticSeverity {
  if (severity === "error") {
    return vscode.DiagnosticSeverity.Error;
  }
  if (severity === "warning") {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}
