import { mkdir, rm, cp, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

//Setup
const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "out", "src"), { recursive: true });

//Source files
await cp(path.join(rootDir, "out", "src"), path.join(distDir, "out", "src"), {
  recursive: true,
  filter: (src, dst) => {
    return !src.endsWith(".js.map");
  }
});

//Extras
async function addFile(filename) {
  await copyFile(path.join(rootDir, filename), path.join(distDir, filename));
}
for (const file of [
  "icon.png",
  "CHANGELOG.md",
  "LICENSE.TXT",
  "README.md",
  ".vscodeignore"
]) {
  await addFile(file);
}

const sourcePackageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
const publishPackageJson = {};

for (const key of [
  "name",
  "displayName",
  "version",
  "publisher",
  "description",
  "author",
  "categories",
  "icon",
  "repository",
  "bugs",
  "engines",
  "license",
  "preview",
  "main",
  "contributes",
  "activationEvents",
  "type",
  "extensionKind",
  "keywords",
  "homepage",
  "qna",
  "sponsor"
]) {
  if (key in sourcePackageJson) {
    publishPackageJson[key] = sourcePackageJson[key];
  }
}

await writeFile(
  path.join(distDir, "package.json"),
  `${JSON.stringify(publishPackageJson, null, 2)}\n`,
  "utf8"
);
