import * as vscode from "vscode";
import { DEBUG_ENV_COMMAND_ID, getConfig, runProcessWithTimeout } from "./shared.js";

export function registerDebugEnvironmentCommand(output: vscode.OutputChannel): vscode.Disposable {
  return vscode.commands.registerCommand(DEBUG_ENV_COMMAND_ID, () => {
    const pathValue = process.env.PATH ?? "(undefined)";
    const executablePath = process.execPath;
    const codexCommand = getConfig().codexCommand;
    const nodePath = process.env.NODE ?? "(undefined)";
    const lookupCommand = process.platform === "win32" ? "where" : "which";

    output.appendLine("[codexlint] Extension Host environment diagnostics");
    output.appendLine(`[codexlint] process.execPath=${executablePath}`);
    output.appendLine(`[codexlint] PATH=${pathValue}`);
    output.appendLine(`[codexlint] NODE=${nodePath}`);
    output.appendLine(`[codexlint] configured codex command=${codexCommand}`);

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
      args: [codexCommand],
      stdin: "",
      timeoutMs: 3_000,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    })
      .then((stdout) => {
        output.appendLine(
          `[codexlint] ${lookupCommand} ${codexCommand} => ${stdout.trim() || "(not found)"}`
        );
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`[codexlint] ${lookupCommand} ${codexCommand} failed => ${message}`);
      });

    output.show(true);
  });
}
