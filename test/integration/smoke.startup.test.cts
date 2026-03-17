import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import * as vscode from "vscode";

suite("smoke startup", () => {
  test("loads workspace and activates codexlint extension", async () => {
    assert.ok(
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0,
      "expected a workspace folder"
    );
    const workspacePath = vscode.workspace.workspaceFolders[0]?.uri.fsPath;
    assert.ok(workspacePath, "expected workspace path");
    console.log(`[smoke] process.cwd=${process.cwd()}`);
    console.log(`[smoke] workspace.fsPath=${workspacePath}`);

    const extension = vscode.extensions.getExtension("SRNissen.codexlint");
    assert.ok(extension, "expected codexlint extension to be installed for tests");

    await extension.activate();
    assert.equal(extension.isActive, true, "expected codexlint extension to be active");
  });

  test("codex exec probe: reports write capability in workspace context", async function () {
    if (process.env.CODEXLINT_RUN_CODEX_PROBE !== "1") {
      this.skip();
      return;
    }

    this.timeout(180_000);

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(workspacePath, "expected workspace path");

    const probePath = path.join(workspacePath, "codex-write-probe.txt");
    await rm(probePath, { force: true });
    await writeFile(probePath, "before\n", "utf8");

    const prompt = [
      "You are running a write-capability probe in a local workspace.",
      `Attempt to append the exact text "after" on a new line to this file: ${probePath}`,
      "If you cannot write, explain why you think writing is blocked in this context.",
      "Respond in plain text with your conclusion."
    ].join(" ");

    const result = await runProcessWithTimeout({
      command: "codex",
      args: ["exec", prompt],
      cwd: workspacePath,
      timeoutMs: 150_000
    });

    const probeContents = await readFile(probePath, "utf8");
    const wroteAfter = probeContents.includes("\nafter");

    console.log(`[smoke] codex probe cwd=${workspacePath}`);
    console.log(`[smoke] codex probe wroteAfter=${wroteAfter}`);
    console.log(`[smoke] codex probe stdout=${result.stdout.trim()}`);
    if (result.stderr.trim().length > 0) {
      console.log(`[smoke] codex probe stderr=${result.stderr.trim()}`);
    }

    assert.equal(result.exitCode, 0, `expected codex exec to exit successfully: ${result.stderr}`);

    await rm(probePath, { force: true });
  });

  test("claude -p probe: reports write capability in workspace context", async function () {
    if (process.env.CODEXLINT_RUN_CLAUDE_PROBE !== "1") {
      this.skip();
      return;
    }

    this.timeout(180_000);

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(workspacePath, "expected workspace path");

    const probePath = path.join(workspacePath, "claude-write-probe.txt");
    await writeClaudeWorkspacePermissions(workspacePath);
    await rm(probePath, { force: true });

    const prompt = [
      "You are running a write-capability probe in a local workspace.",
      `Please create an empty file at this exact path: ${probePath}`,
      "If you cannot write, explain why you think writing is blocked in this context.",
      "Respond in plain text with your conclusion."
    ].join(" ");

    const result = await runProcessWithTimeout({
      command: "claude",
      args: ["-p", prompt],
      cwd: workspacePath,
      timeoutMs: 150_000
    });

    const probeExists = await pathExists(probePath);
    const probeContents = probeExists ? await readFile(probePath, "utf8") : "";

    console.log(`[smoke] claude probe cwd=${workspacePath}`);
    console.log(`[smoke] claude probe exists=${probeExists}`);
    if (probeExists) {
      console.log(`[smoke] claude probe contents=${probeContents}`);
    }
    console.log(`[smoke] claude probe stdout=${result.stdout.trim()}`);
    if (result.stderr.trim().length > 0) {
      console.log(`[smoke] claude probe stderr=${result.stderr.trim()}`);
    }

    assert.equal(result.exitCode, 0, `expected claude -p to exit successfully: ${result.stderr}`);
    assert.equal(probeExists, true, `expected claude -p to create ${probePath}`);

    await rm(probePath, { force: true });
  });
});

async function writeClaudeWorkspacePermissions(workspacePath: string): Promise<void> {
  const claudeDir = path.join(workspacePath, ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");
  const settings = {
    defaultMode: "plan",
    permissions: {
      allow: ["Bash", "Edit", "Write"]
    }
  };

  await mkdir(claudeDir, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 4)}\n`, "utf8");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function runProcessWithTimeout(options: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, Math.max(1, options.timeoutMs));

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new Error(`probe timed out after ${options.timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}
