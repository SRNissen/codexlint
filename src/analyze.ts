import * as vscode from "vscode";
import { type CodexFinding, type CodexLintConfig, runProcessWithTimeout } from "./shared.js";

export type AnalyzeSavedDocumentResult = [
  requestTemplate: Promise<string>,
  responseText: Promise<string>,
  findings: Promise<CodexFinding[]>
];

export async function analyzeSavedDocument(
  document: vscode.TextDocument,
  cfg: CodexLintConfig
): Promise<AnalyzeSavedDocumentResult> {
  const prompt = buildPrompt(document, cfg);
  const args = buildCommandArgs(cfg, prompt.analysisPrompt);
  const stdin = shouldWritePromptToStdin(cfg) ? prompt.analysisPrompt : "";
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const cwd = workspaceFolder?.uri.fsPath;
  const responseText = runProcessWithTimeout({
    command: cfg.analysisCommand,
    args,
    stdin,
    timeoutMs: cfg.timeoutMs,
    cwd
  });
  const findings = responseText.then((output) => parseFindings(output));

  return [Promise.resolve(prompt.requestTemplate), responseText, findings];
}

function buildPrompt(
  document: vscode.TextDocument,
  cfg: CodexLintConfig
): { requestTemplate: string; analysisPrompt: string } {
  const filePath = document.uri.fsPath;
  const fileLanguage = document.languageId;
  const fileText = document.getText();
  const selectedSkills =
    cfg.selectedSkills.length === 0
      ? "- (none selected)"
      : cfg.selectedSkills.map((skill) => `- ${skill}`).join("\n");
  const requestTemplate = renderTemplate(cfg.promptTemplate, {
    filePath,
    fileLanguage,
    selectedSkills
  });
  const analysisPrompt = requestTemplate.split("{{fileText}}").join(fileText);

  return { requestTemplate, analysisPrompt };
}

function buildCommandArgs(cfg: CodexLintConfig, prompt: string): string[] {
  const args = [...cfg.analysisArgs];

  if (shouldPassPromptAsArg(cfg)) {
    args.push(prompt);
  }

  return args;
}

function shouldPassPromptAsArg(cfg: CodexLintConfig): boolean {
  return cfg.promptTransport === "arg";
}

function shouldWritePromptToStdin(cfg: CodexLintConfig): boolean {
  return cfg.promptTransport === "stdin";
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

function parseFindings(rawOutput: string): CodexFinding[] {
  const parsed = parseJsonLenient(rawOutput);

  let findingObjects: unknown[] = [];
  if (Array.isArray(parsed)) {
    findingObjects = parsed;
  } else if (isRecord(parsed) && Array.isArray(parsed.findings)) {
    findingObjects = parsed.findings;
  } else {
    throw new Error("analysis output did not match expected findings schema");
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
    throw new Error("analysis command returned empty output");
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

  throw new Error("analysis command returned non-JSON output");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
