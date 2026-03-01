import * as vscode from "vscode";
import { HELLO_COMMAND_ID } from "./constants.js";

const SAVE_DEBOUNCE_MS = 750;
const DIAGNOSTIC_FLASH_MS = 1200;
const MAX_FILE_BYTES = 1_000_000;
const BINARY_SCAN_CHARS = 8_192;
const DIAGNOSTIC_SOURCE = "codexlint";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("codexlint");
  const pendingByUri = new Map<string, ReturnType<typeof setTimeout>>();
  const flashClearByUri = new Map<string, ReturnType<typeof setTimeout>>();

  const helloCommand = vscode.commands.registerCommand(HELLO_COMMAND_ID, () => {
    void vscode.window.showInformationMessage("codexlint extension is active.");
  });
  const saveHandler = vscode.workspace.onDidSaveTextDocument((document) => {
    const uriKey = document.uri.toString();

    const existingDebounce = pendingByUri.get(uriKey);
    if (existingDebounce !== undefined) {
      clearTimeout(existingDebounce);
    }

    const debounceHandle = setTimeout(() => {
      pendingByUri.delete(uriKey);

      if (!shouldAnalyze(document)) {
        diagnostics.delete(document.uri);

        const existingFlash = flashClearByUri.get(uriKey);
        if (existingFlash !== undefined) {
          clearTimeout(existingFlash);
          flashClearByUri.delete(uriKey);
        }

        return;
      }

      const range = testDiagnosticRange(document);
      const diagnostic = new vscode.Diagnostic(
        range,
        "codexlint save hook test: document passed pre-check filters.",
        vscode.DiagnosticSeverity.Information
      );
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostic.code = "save-hook-test";
      diagnostics.set(document.uri, [diagnostic]);

      const existingFlash = flashClearByUri.get(uriKey);
      if (existingFlash !== undefined) {
        clearTimeout(existingFlash);
      }

      const clearHandle = setTimeout(() => {
        diagnostics.delete(document.uri);
        flashClearByUri.delete(uriKey);
      }, DIAGNOSTIC_FLASH_MS);
      flashClearByUri.set(uriKey, clearHandle);
    }, SAVE_DEBOUNCE_MS);

    pendingByUri.set(uriKey, debounceHandle);
  });

  const timerCleanup = {
    dispose: () => {
      for (const handle of pendingByUri.values()) {
        clearTimeout(handle);
      }
      pendingByUri.clear();

      for (const handle of flashClearByUri.values()) {
        clearTimeout(handle);
      }
      flashClearByUri.clear();
    }
  };

  context.subscriptions.push(diagnostics, helloCommand, saveHandler, timerCleanup);
}

export function deactivate(): void {}

function shouldAnalyze(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== "file") {
    return false;
  }

  const text = document.getText();
  if (text.length === 0) {
    return false;
  }

  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) {
    return false;
  }

  const sample = text.slice(0, BINARY_SCAN_CHARS);
  return !sample.includes("\u0000");
}

function testDiagnosticRange(document: vscode.TextDocument): vscode.Range {
  const firstLine = document.lineAt(0);
  const endColumn = Math.max(1, firstLine.text.length);
  return new vscode.Range(0, 0, 0, endColumn);
}
