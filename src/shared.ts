import * as vscode from "vscode";
import { spawn } from "node:child_process";

export const EXTENSION_NAME = "codexlint";
export const DEFAULT_DEBOUNCE_MS = 750;
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
  "",
  "Enabled skills:",
  "{{skillsList}}",
  "",
  "File path: {{filePath}}",
  "Language: {{fileLanguage}}",
  "File content:",
  "{{fileText}}"
].join("\n");

export type PromptTransport = "stdin" | "arg" | "stdinAndArg";

export interface CodexLintConfig {
  enabled: boolean;
  debounceMs: number;
  maxFileBytes: number;
  skipBinaryFiles: boolean;
  codexCommand: string;
  codexArgs: string[];
  codexModel: string;
  codexModelArg: string;
  codexSkills: string[];
  codexSkillArg: string;
  promptTransport: PromptTransport;
  promptTemplate: string;
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
  const codexArgs = config.get<string[]>("codex.args", ["exec"]);
  const codexSkills = config.get<string[]>("codex.skills", []);
  const promptTransport = config.get<PromptTransport>("codex.promptTransport", "stdinAndArg");
  return {
    enabled: config.get<boolean>("onSave.enabled", true),
    debounceMs: config.get<number>("onSave.debounceMs", DEFAULT_DEBOUNCE_MS),
    maxFileBytes: config.get<number>("onSave.maxFileBytes", DEFAULT_MAX_FILE_BYTES),
    skipBinaryFiles: config.get<boolean>("onSave.skipBinaryFiles", true),
    codexCommand: config.get<string>("codex.command", "codex"),
    codexArgs: Array.isArray(codexArgs) ? codexArgs : ["exec"],
    codexModel: config.get<string>("codex.model", "").trim(),
    codexModelArg: config.get<string>("codex.modelArg", "--model").trim(),
    codexSkills: Array.isArray(codexSkills)
      ? codexSkills.map((skill) => skill.trim()).filter((skill) => skill.length > 0)
      : [],
    codexSkillArg: config.get<string>("codex.skillArg", "--skill").trim(),
    promptTransport: normalizePromptTransport(promptTransport),
    promptTemplate: config.get<string>("codex.promptTemplate", DEFAULT_PROMPT_TEMPLATE),
    timeoutMs: config.get<number>("codex.timeoutMs", DEFAULT_TIMEOUT_MS)
  };
}

function normalizePromptTransport(value: unknown): PromptTransport {
  if (value === "stdin" || value === "arg" || value === "stdinAndArg") {
    return value;
  }
  return "stdinAndArg";
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
