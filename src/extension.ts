import * as vscode from "vscode";
import { printEnv, updateDebugCommandVisibility } from "./debug.js";
import { onSave, type SaveResources } from "./saveCoordinator.js";
import { EXTENSION_NAME } from "./shared.js";

const SHOW_DEBUG_COMMAND_SETTING = "codexlint.operation.showDebugCommand";

export function activate(context: vscode.ExtensionContext): void {
  const resources = createResources();

  const saveHandler = vscode.workspace.onDidSaveTextDocument(
    (document) => onSave(document, resources)
  );
  const debugEnvironment = vscode.commands.registerCommand(
    "codexlint.debugEnvironment",
    () => printEnv(resources.output)
  );
  const configurationHandler = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(SHOW_DEBUG_COMMAND_SETTING)) {
      void updateDebugCommandVisibility();
    }
  });

  void updateDebugCommandVisibility();

  context.subscriptions.push(
    saveHandler,
    configurationHandler,
    debugEnvironment,
    resources
  );
}

export function deactivate(): void { }

interface ExtensionResources extends SaveResources, vscode.Disposable { }

function createResources(): ExtensionResources {
  const diagnostics = vscode.languages.createDiagnosticCollection(EXTENSION_NAME);
  const output = vscode.window.createOutputChannel(EXTENSION_NAME);
  const pendingByUri = new Map<string, ReturnType<typeof setTimeout>>();
  const runSequenceByUri = new Map<string, number>();

  return {
    diagnostics,
    output,
    pendingByUri,
    runSequenceByUri,
    dispose: () => {
      for (const handle of pendingByUri.values()) {
        clearTimeout(handle);
      }
      pendingByUri.clear();
      runSequenceByUri.clear();
      diagnostics.dispose();
      output.dispose();
    }
  };
}
