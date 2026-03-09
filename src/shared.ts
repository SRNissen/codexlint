import * as vscode from "vscode";
import { spawn } from "node:child_process";

export const DIAGNOSTIC_SOURCE = "codexlint";
export const DEFAULT_DEBOUNCE_MS = 750;
export const DEFAULT_MAX_FILE_BYTES = 1_000_000;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEBUG_ENV_COMMAND_ID = "codexlint.debugEnvironment";

export interface CodexLintConfig {
  enabled: boolean;
  debounceMs: number;
  maxFileBytes: number;
  skipBinaryFiles: boolean;
  codexCommand: string;
  codexArgs: string[];
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
