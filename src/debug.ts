import * as vscode from "vscode";
import { getConfig, runProcessWithTimeout } from "./shared.js";

export function printEnv(output: vscode.OutputChannel) {
  const pathValue = process.env.PATH ?? "(undefined)";
  const executablePath = process.execPath;
  const configuredCommand = getConfig().codexCommand;
  const nodePath = process.env.NODE ?? "(undefined)";
  const lookupCommand = process.platform === "win32" ? "where" : "which";

  output.appendLine("[codexlint] Extension Host environment diagnostics");
  output.appendLine(`[codexlint] process.execPath=${executablePath}`);
  output.appendLine(`[codexlint] PATH=${pathValue}`);
  output.appendLine(`[codexlint] NODE=${nodePath}`);
  output.appendLine(`[codexlint] configured analysis command=${configuredCommand}`);

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
    args: [configuredCommand],
    stdin: "",
    timeoutMs: 3_000,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  })
    .then((stdout) => {
      output.appendLine(
        `[codexlint] ${lookupCommand} ${configuredCommand} => ${stdout.trim() || "(not found)"}`
      );
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(
        `[codexlint] ${lookupCommand} ${configuredCommand} failed => ${message}`
      );
    });

  output.show(true);
}
