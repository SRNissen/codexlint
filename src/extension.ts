import * as vscode from "vscode";
import { analyzeSavedDocument } from "./analyze.js";
import { registerDebugEnvironmentCommand } from "./debug.js";
import { DIAGNOSTIC_SOURCE, getConfig } from "./shared.js";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const output = vscode.window.createOutputChannel(DIAGNOSTIC_SOURCE);
  const pendingByUri = new Map<string, ReturnType<typeof setTimeout>>();
  const runSequenceByUri = new Map<string, number>();

  const debugEnvironmentCommand = registerDebugEnvironmentCommand(output);

  const saveHandler = vscode.workspace.onDidSaveTextDocument((document) => {
    const cfg = getConfig();
    if (!cfg.enabled) {
      return;
    }

    const uriKey = document.uri.toString();
    const nextSequence = (runSequenceByUri.get(uriKey) ?? 0) + 1;
    runSequenceByUri.set(uriKey, nextSequence);

    const existingDebounce = pendingByUri.get(uriKey);
    if (existingDebounce !== undefined) {
      clearTimeout(existingDebounce);
    }

    const debounceHandle = setTimeout(() => {
      pendingByUri.delete(uriKey); 
      void analyzeSavedDocument(document, nextSequence, runSequenceByUri, diagnostics, output);
    }, Math.max(0, cfg.debounceMs));

    pendingByUri.set(uriKey, debounceHandle);
  });

  const timerCleanup = {
    dispose: () => {
      for (const handle of pendingByUri.values()) {
        clearTimeout(handle);
      }
      pendingByUri.clear();
    }
  };

  context.subscriptions.push(
    diagnostics,
    output,
    debugEnvironmentCommand,
    saveHandler,
    timerCleanup
  );
}

export function deactivate(): void {}
