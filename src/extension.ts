import * as vscode from "vscode";
import { printEnv } from "./debug.js";
import {
  createSaveCoordinatorState,
  createSaveTimerCleanup,
  registerSaveHandler
} from "./saveCoordinator.js";
import { DIAGNOSTIC_SOURCE } from "./shared.js";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const output = vscode.window.createOutputChannel(DIAGNOSTIC_SOURCE);
  const saveCoordinatorState = createSaveCoordinatorState();
  const saveHandler = registerSaveHandler(saveCoordinatorState, { diagnostics, output });
  const timerCleanup = createSaveTimerCleanup(saveCoordinatorState);
  const debugEnvironment = vscode.commands.registerCommand("codexlint.debugEnvironment", () => {
    printEnv(output);
  });

  context.subscriptions.push(
    diagnostics,
    output,
    debugEnvironment,
    saveHandler,
    timerCleanup
  );
}

export function deactivate(): void {}
