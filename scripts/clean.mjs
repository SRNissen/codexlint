import { rm } from "node:fs/promises";

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("Expected at least one path to clean.");
  process.exit(1);
}

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
}
