export type PlainFindingSeverity = "error" | "warning" | "info";

export interface AnalysisRequestOptions {
  filePath: string;
  fileLanguage: string;
  fileText: string;
  selectedSkills: string[];
  promptTemplate: string;
  analysisArgs: string[];
  promptTransport: "stdin" | "arg";
}

export interface AnalysisRequest {
  requestTemplate: string;
  analysisPrompt: string;
  args: string[];
  stdin: string;
}

export interface PlainFinding {
  message: string;
  severity: PlainFindingSeverity;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  code: string | number | undefined;
}

export function buildAnalysisRequest(options: AnalysisRequestOptions): AnalysisRequest {
  const selectedSkills =
    options.selectedSkills.length === 0
      ? ""
      : options.selectedSkills.map((skill) => `- ${skill}`).join("\n");
  const selectedSkillsBlock =
    selectedSkills.length > 0
      ? ["", "Selected skills to highlight (informational only):", selectedSkills].join("\n")
      : "";
  const requestTemplate = renderTemplate(options.promptTemplate, {
    filePath: options.filePath,
    fileLanguage: options.fileLanguage,
    selectedSkills,
    selectedSkillsBlock
  });
  const analysisPrompt = requestTemplate.split("{{fileText}}").join(options.fileText);
  const args = [...options.analysisArgs];

  if (options.promptTransport === "arg") {
    args.push(analysisPrompt);
  }

  return {
    requestTemplate,
    analysisPrompt,
    args,
    stdin: options.promptTransport === "stdin" ? analysisPrompt : ""
  };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

export function parseFindings(rawOutput: string): PlainFinding[] {
  const parsed = parseJsonLenient(rawOutput);

  let findingObjects: unknown[] = [];
  if (Array.isArray(parsed)) {
    findingObjects = parsed;
  } else if (isRecord(parsed) && Array.isArray(parsed.findings)) {
    findingObjects = parsed.findings;
  } else {
    throw new Error("analysis output did not match expected findings schema");
  }

  const findings: PlainFinding[] = [];
  for (const entry of findingObjects) {
    const finding = normalizeFinding(entry);
    if (finding !== null) {
      findings.push(finding);
    }
  }

  return findings;
}

function normalizeFinding(value: unknown): PlainFinding | null {
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

function parseSeverity(value: unknown): PlainFindingSeverity {
  if (value === "error") {
    return "error";
  }
  if (value === "warning") {
    return "warning";
  }
  return "info";
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : fallback;
}

export function parseJsonLenient(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return buildParserFailureResult("analysis command returned empty output");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fallback parsers.
  }

  const fenceStart = trimmed.indexOf("```");
  const fenceEnd = trimmed.lastIndexOf("```");
  if (fenceStart >= 0 && fenceEnd > fenceStart) {
    let fencedJson = trimmed.slice(fenceStart + 3, fenceEnd).trim();

    const firstLineBreak = fencedJson.indexOf("\n");
    if (firstLineBreak >= 0) {
      const maybeLanguage = fencedJson.slice(0, firstLineBreak).trim().toLowerCase();
      if (maybeLanguage === "json") {
        fencedJson = fencedJson.slice(firstLineBreak + 1).trim();
      }
    }

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

  return buildParserFailureResult("analysis command returned non-JSON output", trimmed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildParserFailureResult(reason: string, rawOutput?: string): unknown {
  const rawSummary =
    rawOutput === undefined || rawOutput.length === 0
      ? ""
      : ` Raw output (truncated): ${rawOutput.slice(0, 500)}`;

  return {
    findings: [
      {
        message: `${reason}.${rawSummary}`,
        severity: "warning",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1
      }
    ]
  };
}
