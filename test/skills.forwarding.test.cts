import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";

suite("skills forwarding", () => {
  test("runs configured analysis command on save", async () => {
    const workspaceFolder = getWorkspaceFolder();
    const analyzer = await writeFakeAnalyzer("analysis-ran");

    await configureAnalyzer({
      analyzerArgs: [analyzer.scriptPath, analyzer.expectedCode],
      skills: [],
      promptTemplate: "File: {{filePath}}\n{{fileText}}"
    });

    const uri = vscode.Uri.joinPath(workspaceFolder.uri, "analysis-runs-on-save.c");
    const diagnostics = await saveAndWaitForDiagnostic(uri, "analysis-ran");

    assert.ok(
      diagnostics.find((diagnostic) => diagnostic.code === "analysis-ran"),
      "expected finding proving configured analysis command was invoked"
    );
  });

  test("forwards configured skills to args and prompt", async () => {
    const workspaceFolder = getWorkspaceFolder();
    const analyzer = await writeFakeAnalyzer("skills-used");

    await configureAnalyzer({
      analyzerArgs: [analyzer.scriptPath, analyzer.expectedCode],
      skills: ["alpha-skill", "beta-skill"],
      promptTemplate: ["Enabled skills:", "{{skillsList}}", "", "{{fileText}}"].join("\n")
    });

    const uri = vscode.Uri.joinPath(workspaceFolder.uri, "skills-forwarding.c");
    const diagnostics = await saveAndWaitForDiagnostic(uri, "skills-used");

    assert.ok(
      diagnostics.find((diagnostic) => diagnostic.code === "skills-used"),
      "expected finding proving skills were forwarded via args and prompt"
    );
  });
});

function getWorkspaceFolder(): vscode.WorkspaceFolder {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "expected a workspace folder");
  return workspaceFolder;
}

async function configureAnalyzer(options: {
  analyzerArgs: string[];
  skills: string[];
  promptTemplate: string;
}): Promise<void> {
  const config = vscode.workspace.getConfiguration("codexlint");
  await config.update("onSave.enabled", true, vscode.ConfigurationTarget.Workspace);
  await config.update("onSave.debounceMs", 0, vscode.ConfigurationTarget.Workspace);
  await config.update("codex.command", process.execPath, vscode.ConfigurationTarget.Workspace);
  await config.update("codex.args", options.analyzerArgs, vscode.ConfigurationTarget.Workspace);
  await config.update("codex.skillArg", "--skill", vscode.ConfigurationTarget.Workspace);
  await config.update("codex.skills", options.skills, vscode.ConfigurationTarget.Workspace);
  await config.update("codex.promptTransport", "stdin", vscode.ConfigurationTarget.Workspace);
  await config.update(
    "codex.promptTemplate",
    options.promptTemplate,
    vscode.ConfigurationTarget.Workspace
  );
}

async function saveAndWaitForDiagnostic(
  uri: vscode.Uri,
  expectedCode: string
): Promise<vscode.Diagnostic[]> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from("int main() { return 0; }\n", "utf8"));
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  await editor.edit((builder) => {
    builder.insert(new vscode.Position(0, 0), "// trigger analysis\n");
  });
  await document.save();

  return waitFor(() => {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    return diagnostics.some((diagnostic) => diagnostic.code === expectedCode)
      ? diagnostics
      : undefined;
  }, 12_000);
}

async function writeFakeAnalyzer(
  expectedCode: string
): Promise<{ scriptPath: string; expectedCode: string }> {
  const scriptDir = await mkdtemp(path.join(tmpdir(), "codexlint-test-"));
  const scriptPath = path.join(scriptDir, "fake-codex.cjs");
  const scriptContents = [
    "const expectedCode = process.argv[2];",
    "const args = process.argv.slice(3);",
    "let stdin = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => { stdin += chunk; });",
    "process.stdin.on('end', () => {",
    "  const hasSkillsInArgs = args.includes('--skill') && args.includes('alpha-skill') && args.includes('beta-skill');",
    "  const hasSkillsInPrompt = stdin.includes('- alpha-skill') && stdin.includes('- beta-skill');",
    "  const isSkillsCase = expectedCode === 'skills-used';",
    "  const findings = isSkillsCase",
    "    ? (hasSkillsInArgs && hasSkillsInPrompt",
    "      ? [{ message: 'skills forwarded', severity: 'warning', line: 1, column: 1, endLine: 1, endColumn: 2, code: expectedCode }]",
    "      : [])",
    "    : [{ message: 'analysis executed', severity: 'info', line: 1, column: 1, endLine: 1, endColumn: 2, code: expectedCode }];",
    "  process.stdout.write(JSON.stringify({ findings }));",
    "});"
  ].join("\n");

  await writeFile(scriptPath, scriptContents, "utf8");
  return { scriptPath, expectedCode };
}

async function waitFor<T>(probe: () => T | undefined, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== undefined) {
      return value;
    }
    await sleep(100);
  }

  throw new Error(`timed out after ${timeoutMs}ms`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
