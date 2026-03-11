import * as vscode from "vscode";
import { getConfig, runProcessWithTimeout, EXTENSION_NAME } from "./shared.js";

export function printEnv(output: vscode.OutputChannel) {
  const pathValue = process.env.PATH ?? "(undefined)";
  const executablePath = process.execPath;
  const configuredCommand = getConfig().analysisCommand;
  const nodePath = process.env.NODE ?? "(undefined)";
  const lookupCommand = process.platform === "win32" ? "where" : "which";

  output.appendLine(`[${EXTENSION_NAME}] Extension Host environment diagnostics`);
  output.appendLine(`[${EXTENSION_NAME}] process.execPath=${executablePath}`);
  output.appendLine(`[${EXTENSION_NAME}] PATH=${pathValue}`);
  output.appendLine(`[${EXTENSION_NAME}] NODE=${nodePath}`);
  output.appendLine(`[${EXTENSION_NAME}] configured analysis command=${configuredCommand}`);

  void runProcessWithTimeout({
    command: lookupCommand,
    args: ["node"],
    stdin: "",
    timeoutMs: 3_000,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  })
    .then((stdout) => {
      output.appendLine(`[${EXTENSION_NAME}] ${lookupCommand} node => ${stdout.trim() || "(not found)"}`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`[${EXTENSION_NAME}] ${lookupCommand} node failed => ${message}`);
    });

  void runProcessWithTimeout({
    command: lookupCommand,
    args: [configuredCommand],
    stdin: "",
    timeoutMs: 3_000,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  })
    .then((stdout) => {
      output.appendLine(
        `[${EXTENSION_NAME}] ${lookupCommand} ${configuredCommand} => ${stdout.trim() || "(not found)"}`
      );
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(
        `[${EXTENSION_NAME}] ${lookupCommand} ${configuredCommand} failed => ${message}`
      );
    });

  output.show(true);
}
