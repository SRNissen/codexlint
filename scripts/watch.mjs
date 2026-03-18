import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const watchScripts = ["watch:extension", "watch:typecheck"];
const children = new Set();
let exiting = false;

function startWatch(scriptName) {
  const child = spawn(npmCommand, ["run", scriptName], {
    stdio: "inherit"
  });

  children.add(child);

  child.on("error", (error) => {
    console.error(`Failed to start ${scriptName}:`, error);
    requestShutdown(1);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (exiting) {
      return;
    }

    if (signal !== null) {
      console.error(`${scriptName} exited from signal ${signal}.`);
      requestShutdown(1, signal);
      return;
    }

    if ((code ?? 0) !== 0) {
      console.error(`${scriptName} exited with code ${code ?? 1}.`);
      requestShutdown(code ?? 1);
    }
  });
}

function requestShutdown(exitCode, signal = null) {
  if (exiting) {
    return;
  }

  exiting = true;

  for (const child of children) {
    child.kill(signal ?? "SIGTERM");
  }

  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(exitCode);
}

for (const scriptName of watchScripts) {
  startWatch(scriptName);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    requestShutdown(0, signal);
  });
}
