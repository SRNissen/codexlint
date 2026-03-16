import assert from "node:assert/strict";
import * as vscode from "vscode";

suite("smoke startup", () => {
  test("loads workspace and activates codexlint extension", async () => {
    assert.ok(
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0,
      "expected a workspace folder"
    );

    const extension = vscode.extensions.getExtension("SRNissen.codexlint");
    assert.ok(extension, "expected codexlint extension to be installed for tests");

    await extension.activate();
    assert.equal(extension.isActive, true, "expected codexlint extension to be active");
  });
});
