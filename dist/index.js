import path from "path";
import fs from "fs/promises";
import { createHash } from "crypto";
async function getFilePaths(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const promises = [];
    for (let i = 0; i < dirents.length; i++) {
        const dirent = dirents[i];
        const direntPath = path.resolve(dir, dirent.name);
        promises.push(dirent.isDirectory()
            ? getFilePaths(direntPath)
            : Promise.resolve(direntPath));
    }
    const filePaths = await Promise.all(promises);
    return filePaths.flat();
}
async function generateFileHash(filePath) {
    const buf = await fs.readFile(filePath);
    const hash = createHash("sha256").update(buf).digest("base64url");
    const newPath = filePath.replace(/\.[^(html)]+$/, (ext) => {
        return `.${hash}${ext}`;
    });
    return newPath;
}
async function hashFileNames(paths) {
    const oldPaths = [];
    const promises = [];
    for (let i = 0; i < paths.length; i++) {
        oldPaths.push(paths[i]);
        if (/\.html$/.test(paths[i])) {
            promises.push(Promise.resolve(paths[i]));
        }
        else {
            promises.push(generateFileHash(paths[i]));
        }
    }
    const newPaths = await Promise.all(promises);
    const hashedFiles = {};
    for (let i = 0; i < oldPaths.length; i++) {
        hashedFiles[oldPaths[i]] = newPaths[i];
    }
    return hashedFiles;
}
async function replacePlaceholders(rootDir, outDir, paths, hashedFiles, baseURL) {
    const promises = [];
    for (let i = 0; i < paths.length; i++) {
        promises.push((async function () {
            let outFile = await fs.readFile(paths[i]);
            let outTxt = "";
            if (/\.(?:html|css|js)$/.test(paths[i])) {
                outTxt = outFile
                    .toString("utf-8")
                    .replace(/({{)([^{}]+)(}})/g, (_, __, oldRelativePath) => {
                    const oldPath = path.resolve(path.dirname(paths[i]), oldRelativePath);
                    const newPath = hashedFiles[oldPath];
                    return baseURL + path.relative(rootDir, newPath);
                });
            }
            const outRelativePath = path.relative(rootDir, hashedFiles[paths[i]]);
            const outPath = path.resolve(outDir, outRelativePath);
            await fs.mkdir(path.dirname(outPath), { recursive: true });
            if (outTxt) {
                await fs.writeFile(outPath, outTxt, {
                    encoding: "utf-8",
                });
                return;
            }
            await fs.writeFile(outPath, outFile);
        })());
    }
    await Promise.all(promises);
}
async function main(rootDir, outDir, baseURL) {
    const filePaths = await getFilePaths(rootDir);
    const hashedFiles = await hashFileNames(filePaths);
    await replacePlaceholders(rootDir, outDir, filePaths, hashedFiles, baseURL);
}
const args = process.argv;
if (args.length < 5) {
    throw new Error("Arguments rootDir, outDir, and baseURL have not been provided.");
}
await main(args[2], args[3], args[4]);
