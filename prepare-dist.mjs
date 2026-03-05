import { mkdir, rm, cp, copyFile } from "node:fs/promises";
import path from "node:path";

//Setup
const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "out", "src"), { recursive: true });

//Source files
await cp(
    path.join(rootDir, "out", "src"),
    path.join(distDir, "out", "src"),
    {
        recursive: true,
        filter: (src, dst) => {
            return !src.endsWith('.js.map');
        }
    }
);

//Extras
async function addFile(filename) {
    await copyFile(path.join(rootDir, filename), path.join(distDir, filename));
}
[
    'icon.png',
    'CHANGELOG.md',
    'LICENSE.TXT',
    'README.md',
    'package.json',
    '.vscodeignore'
].forEach(addFile);