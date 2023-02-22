import path from "path";
import fs from "fs/promises";
import { createHash } from "crypto";

async function getFilePaths(dir: string): Promise<string[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const promises: Promise<string[] | string>[] = [];
  for (let i = 0; i < dirents.length; i++) {
    const dirent = dirents[i]!;
    const direntPath = path.resolve(dir, dirent.name);
    promises.push(
      dirent.isDirectory()
        ? getFilePaths(direntPath)
        : Promise.resolve(direntPath)
    );
  }
  const filePaths = await Promise.all(promises);
  return filePaths.flat();
}

async function generateFileHash(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const hash = createHash("sha256").update(buf).digest("base64url");
  const newPath = filePath.replace(/\.[^(html)]+$/, (ext: string) => {
    return `.${hash}${ext}`;
  });
  return newPath;
}

async function hashFileNames(paths: string[]): Promise<{
  [oldPath: string]: string;
}> {
  const oldPaths: string[] = [];
  const promises: Promise<string>[] = [];
  for (let i = 0; i < paths.length; i++) {
    oldPaths.push(paths[i]!);
    if (/\.html$/.test(paths[i]!)) {
      promises.push(Promise.resolve(paths[i]!));
    } else {
      promises.push(generateFileHash(paths[i]!));
    }
  }
  const newPaths = await Promise.all(promises);
  const hashedFiles: { [oldPath: string]: string } = {};
  for (let i = 0; i < oldPaths.length; i++) {
    hashedFiles[oldPaths[i]!] = newPaths[i]!;
  }
  return hashedFiles;
}

async function replacePlaceholders(
  rootDir: string,
  outDir: string,
  paths: string[],
  hashedFiles: { [oldPath: string]: string }
): Promise<void> {
  const promises = [];
  for (let i = 0; i < paths.length; i++) {
    promises.push(
      (async function () {
        let outFile = await fs.readFile(paths[i]!);
        let outTxt: string = "";
        if (/\.(?:html|css|js)$/.test(paths[i]!)) {
          outTxt = outFile
            .toString("utf-8")
            .replace(/({{)([^{}]+)(}})/g, (_, __, oldRelativePath: string) => {
              const oldPath = path.resolve(
                path.dirname(paths[i]!),
                oldRelativePath
              );
              const newPath = hashedFiles[oldPath]!;
              return path.relative(rootDir, newPath);
            });
        }
        const outRelativePath = path.relative(rootDir, hashedFiles[paths[i]!]!);
        const outPath = path.resolve(outDir, outRelativePath);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        if (outTxt) {
          await fs.writeFile(outPath, outTxt, {
            encoding: "utf-8",
          });
          return;
        }
        await fs.writeFile(outPath, outFile);
      })()
    );
  }
  await Promise.all(promises);
}

async function main(rootDir: string, outDir: string) {
  const filePaths = await getFilePaths(rootDir);
  const hashedFiles = await hashFileNames(filePaths);
  await replacePlaceholders(rootDir, outDir, filePaths, hashedFiles);
}

const args = process.argv;
if (args.length < 4) {
  throw new Error("Arguments rootDir and outDir have not been provided.");
}

await main(args[2]!, args[3]!);
