import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "vsce.cmd" : "vsce";

const child = spawn(command, ["package", "--no-dependencies"], {
  cwd: "dist",
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
