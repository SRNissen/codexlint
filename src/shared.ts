import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { parseArgsStringToArgv } from "string-argv";

export const EXTENSION_NAME = "codexlint";
export const DEFAULT_DEBOUNCE_MS = 750;
export const DEFAULT_MIN_FILE_REANALYZE_MS = 300_000;
export const DEFAULT_MAX_FILE_BYTES = 1_000_000;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_PROMPT_TEMPLATE = [
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
  "{{selectedSkillsBlock}}",
  "",
  "File path: {{filePath}}",
  "Language: {{fileLanguage}}",
  "File content:",
  "{{fileText}}"
].join("\n");

export type AnalyzerPreset = "codexExec" | "claudeP" | "custom";
export type PromptTransport = "stdin" | "arg";

export interface CodexLintConfig {
  enabled: boolean;
  debounceMs: number;
  minFileReanalyzeMs: number;
  maxFileBytes: number;
  skipBinaryFiles: boolean;
  showDebugIO: boolean;
  analysisCommand: string;
  analysisArgs: string[];
  promptTransport: PromptTransport;
  promptTemplate: string;
  selectedSkills: string[];
  timeoutMs: number;
}

export interface CodexFinding {
  message: string;
  severity: vscode.DiagnosticSeverity;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  code: string | number | undefined;
}

export function getConfig(): CodexLintConfig {
  const config = vscode.workspace.getConfiguration("codexlint");
  const analyzerPreset = normalizeAnalyzerPreset(
    getUserPreferredConfigValue(config, "analyzer.command", "codexExec")
  );
  const customCommand = getUserPreferredConfigValue(config, "analyzer.customCommand", "");
  const customInput = normalizePromptTransport(
    getUserPreferredConfigValue(config, "analyzer.customInput", "arg")
  );
  const selectedSkills = parseSelectedSkills(
    getUserPreferredConfigValue(config, "prompt.selectedSkills", "")
  );
  const highlightSelectedSkills = getUserPreferredConfigValue(
    config,
    "prompt.highlightSelectedSkills",
    false
  );
  const useCustomPrompt = getUserPreferredConfigValue(config, "prompt.customPrompt", false);
  const customPrompt = getUserPreferredConfigValue(config, "prompt.customPromptText", "");
  const { command, args, promptTransport } = resolveAnalyzer(analyzerPreset, customCommand, customInput);
  const promptTemplate =
    useCustomPrompt && customPrompt.trim().length > 0 ? customPrompt : DEFAULT_PROMPT_TEMPLATE;

  return {
    enabled: getUserPreferredConfigValue(config, "operation.enabled", true),
    debounceMs: getUserPreferredConfigValue(config, "operation.debounceMs", DEFAULT_DEBOUNCE_MS),
    minFileReanalyzeMs: Math.max(
      0,
      getUserPreferredConfigValue(
        config,
        "operation.minFileReanalyzeMs",
        DEFAULT_MIN_FILE_REANALYZE_MS
      )
    ),
    maxFileBytes: getUserPreferredConfigValue(config, "operation.maxFileBytes", DEFAULT_MAX_FILE_BYTES),
    skipBinaryFiles: getUserPreferredConfigValue(config, "operation.skipBinaryFiles", true),
    showDebugIO: getUserPreferredConfigValue(config, "operation.showDebugIO", false),
    analysisCommand: command,
    analysisArgs: args,
    promptTransport,
    promptTemplate,
    selectedSkills: highlightSelectedSkills ? selectedSkills : [],
    timeoutMs: getUserPreferredConfigValue(config, "operation.timeoutMs", DEFAULT_TIMEOUT_MS)
  };
}

export function getUserPreferredConfigValue<T>(
  config: vscode.WorkspaceConfiguration,
  key: string,
  defaultValue: T
): T {
  const inspected = config.inspect<T>(key);
  if (inspected?.globalLanguageValue !== undefined) {
    return inspected.globalLanguageValue;
  }
  if (inspected?.globalValue !== undefined) {
    return inspected.globalValue;
  }
  if (inspected?.defaultLanguageValue !== undefined) {
    return inspected.defaultLanguageValue;
  }
  if (inspected?.defaultValue !== undefined) {
    return inspected.defaultValue;
  }
  return defaultValue;
}

function normalizePromptTransport(value: unknown): PromptTransport {
  if (value === "stdin" || value === "arg") {
    return value;
  }
  return "arg";
}

function normalizeAnalyzerPreset(value: unknown): AnalyzerPreset {
  if (value === "codexExec" || value === "claudeP" || value === "custom") {
    return value;
  }
  return "codexExec";
}

function parseSelectedSkills(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function resolveAnalyzer(
  preset: AnalyzerPreset,
  customCommand: string,
  customInput: PromptTransport
): { command: string; args: string[]; promptTransport: PromptTransport } {
  if (preset === "codexExec") {
    return { command: "codex", args: ["exec", "--sandbox", "read-only"], promptTransport: "arg" };
  }

  if (preset === "claudeP") {
    return { command: "claude", args: ["-p", "--permission-mode", "dontAsk", "--tools", "Read"], promptTransport: "arg" };
  }

  const parsed = parseArgsStringToArgv(customCommand.trim());
  const [command, ...args] = parsed;
  if (command === undefined) {
    return { command: "", args: [], promptTransport: customInput };
  }

  return { command, args, promptTransport: customInput };
}

export function runProcessWithTimeout(options: {
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
        reject(new Error(`analysis command timed out after ${options.timeoutMs}ms`));
        return;
      }

      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`analysis command failed: ${detail}`));
        return;
      }

      resolve(stdout);
    });

    child.stdin.write(options.stdin);
    child.stdin.end();
  });
}
