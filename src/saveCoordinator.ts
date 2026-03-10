import * as vscode from "vscode";
import { analyzeSavedDocument } from "./analyze.js";
import { getConfig } from "./shared.js";

interface SaveHandlerOptions {
  diagnostics: vscode.DiagnosticCollection;
  output: vscode.OutputChannel;
}

export interface SaveCoordinatorState {
  pendingByUri: Map<string, ReturnType<typeof setTimeout>>;
  runSequenceByUri: Map<string, number>;
}

export function createSaveCoordinatorState(): SaveCoordinatorState {
  return {
    pendingByUri: new Map<string, ReturnType<typeof setTimeout>>(),
    runSequenceByUri: new Map<string, number>()
  };
}

export function registerSaveHandler(
  state: SaveCoordinatorState,
  options: SaveHandlerOptions
): vscode.Disposable {
  const saveHandler = vscode.workspace.onDidSaveTextDocument((document) => {
    const cfg = getConfig();
    if (!cfg.enabled) {
      return;
    }

    const uriKey = document.uri.toString();
    const nextSequence = (state.runSequenceByUri.get(uriKey) ?? 0) + 1;
    state.runSequenceByUri.set(uriKey, nextSequence);

    const existingDebounce = state.pendingByUri.get(uriKey);
    if (existingDebounce !== undefined) {
      clearTimeout(existingDebounce);
    }

    const debounceHandle = setTimeout(() => {
      state.pendingByUri.delete(uriKey);
      void analyzeSavedDocument(
        document,
        nextSequence,
        state.runSequenceByUri,
        options.diagnostics,
        options.output
      );
    }, Math.max(0, cfg.debounceMs));

    state.pendingByUri.set(uriKey, debounceHandle);
  });

  return saveHandler;
}

export function createSaveTimerCleanup(state: SaveCoordinatorState): vscode.Disposable {
  return {
    dispose: () => {
      for (const handle of state.pendingByUri.values()) {
        clearTimeout(handle);
      }
      state.pendingByUri.clear();
      state.runSequenceByUri.clear();
    }
  };
}
