import * as vscode from "vscode";
import { analyzeSavedDocument } from "./analyze.js";
import { getConfig } from "./shared.js";

export interface SaveResources {
  diagnostics: vscode.DiagnosticCollection;
  output: vscode.OutputChannel;
  pendingByUri: Map<string, ReturnType<typeof setTimeout>>;
  runSequenceByUri: Map<string, number>;
}

export function onSave(document: vscode.TextDocument, resources: SaveResources): void {
  const cfg = getConfig();
  if (!cfg.enabled) {
    return;
  }

  const uriKey = document.uri.toString();
  const nextSequence = (resources.runSequenceByUri.get(uriKey) ?? 0) + 1;
  resources.runSequenceByUri.set(uriKey, nextSequence);

  const existingDebounce = resources.pendingByUri.get(uriKey);
  if (existingDebounce !== undefined) {
    clearTimeout(existingDebounce);
  }

  const debounceHandle = setTimeout(() => {
    resources.pendingByUri.delete(uriKey);
    void analyzeSavedDocument(
      document,
      nextSequence,
      resources.runSequenceByUri,
      resources.diagnostics,
      resources.output
    );
  }, Math.max(0, cfg.debounceMs));

  resources.pendingByUri.set(uriKey, debounceHandle);
}
