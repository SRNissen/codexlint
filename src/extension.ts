import * as vscode from "vscode";
import { HELLO_COMMAND_ID } from "./constants.js";

export function activate(context: vscode.ExtensionContext): void {
  const helloCommand = vscode.commands.registerCommand(HELLO_COMMAND_ID, () => {
    void vscode.window.showInformationMessage("codexlint extension is active.");
  });

  context.subscriptions.push(helloCommand);
}

export function deactivate(): void {}
