import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import testElectron from "@vscode/test-electron";

const { downloadAndUnzipVSCode } = testElectron;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(__dirname);
const vscodeVersion = "1.111.0";
const workspaceFolder = path.join(repoRoot, "test-workspace");
const extensionTestsPath = path.join(
  repoRoot,
  "node_modules",
  "@vscode",
  "test-cli",
  "out",
  "runner.cjs"
);
const testFile = path.join(
  repoRoot,
  "out",
  "test",
  "workspace-trust-diagnostic",
  "workspace-trust.manual.test.cjs"
);
const runRoot = path.join(repoRoot, ".vscode-test", "workspace-trust-diagnostic");
const userDataDir = path.join(runRoot, "user-data");
const extensionsDir = path.join(runRoot, "extensions");

await assertFileExists(
  path.join(repoRoot, "out", "src", "extension.js"),
  "extension output is not built. Run `npm run build` first."
);
await assertFileExists(
  testFile,
  "workspace trust diagnostic tests are not built. Run `npm run build` first."
);
await assertFileExists(
  workspaceFolder,
  "workspace trust diagnostic workspace is missing. Run `npm run reset:test-workspace` first."
);

await rm(runRoot, { recursive: true, force: true });
await mkdir(userDataDir, { recursive: true });
await mkdir(extensionsDir, { recursive: true });
await seedUserSettings(userDataDir);

const vscodeExecutablePath = await downloadAndUnzipVSCode({ version: vscodeVersion });
const extensionTestsEnv = {
  ...process.env,
  VSCODE_TEST_OPTIONS: JSON.stringify({
    files: [testFile],
    preload: [],
    colorDefault: Boolean(process.stdout.isTTY),
    mochaOpts: {
      timeout: 600_000,
      forbidPending: true
    }
  })
};
const args = [
  workspaceFolder,
  "--disable-extensions",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-gpu-sandbox",
  "--disable-updates",
  "--skip-welcome",
  "--skip-release-notes",
  `--user-data-dir=${userDataDir}`,
  `--extensions-dir=${extensionsDir}`,
  `--extensionDevelopmentPath=${repoRoot}`,
  `--extensionTestsPath=${extensionTestsPath}`
];

await launchVsCode(vscodeExecutablePath, args, extensionTestsEnv);

async function seedUserSettings(targetUserDataDir) {
  const settingsPath = path.join(targetUserDataDir, "User", "settings.json");
  const settings = {
    "security.workspace.trust.enabled": true,
    "security.workspace.trust.startupPrompt": "never",
    "extensions.supportUntrustedWorkspaces": {
      "SRNissen.codexlint": {
        "supported": true
      }
    }
  };

  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function assertFileExists(filePath, message) {
  try {
    await access(filePath);
  } catch {
    throw new Error(message);
  }
}

function launchVsCode(executablePath, args, env) {
  return new Promise((resolve, reject) => {
    const shell = process.platform === "win32";
    const child = spawn(shell ? `"${executablePath}"` : executablePath, args, {
      env,
      shell,
      stdio: "inherit"
    });

    let finished = false;
    const complete = (error) => {
      if (finished) {
        return;
      }
      finished = true;
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };

    child.on("error", (error) => complete(error));
    child.on("close", (code, signal) => {
      if (code === 0) {
        complete();
        return;
      }

      if (signal !== null) {
        complete(new Error(`VS Code diagnostic run terminated with signal ${signal}`));
        return;
      }

      complete(new Error(`VS Code diagnostic run failed with exit code ${code}`));
    });
  });
}
