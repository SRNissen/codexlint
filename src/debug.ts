import * as vscode from "vscode";
import { getConfig, getUserPreferredConfigValue, runProcessWithTimeout, EXTENSION_NAME } from "./shared.js";

const SHOW_DEBUG_COMMAND_CONTEXT = "codexlint.showDebugEnvironmentCommand";

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

export async function updateDebugCommandVisibility(): Promise<void> {
  const config = vscode.workspace.getConfiguration("codexlint");
  const isVisible = getUserPreferredConfigValue(config, "operation.showDebugCommand", false);
  await vscode.commands.executeCommand("setContext", SHOW_DEBUG_COMMAND_CONTEXT, isVisible);
}
