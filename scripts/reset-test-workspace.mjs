import { mkdir, rm } from "node:fs/promises";

const target = "test-workspace";

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
