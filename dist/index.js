import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
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
    const hash = crypto.createHash("sha256").update(buf).digest("base64url");
    const newPath = filePath.replace(/\.\w+$/, (ext) => {
        return `.${hash}${ext}`;
    });
    return newPath;
}
async function generateFileHashes(paths) {
    const promises = [];
    for (let i = 0; i < paths.length; i++) {
        if (/\.html$/.test(paths[i])) {
            promises.push(Promise.resolve(paths[i]));
        }
        else {
            promises.push(generateFileHash(paths[i]));
        }
    }
    const newPaths = await Promise.all(promises);
    const hashedFilePaths = {};
    for (let i = 0; i < paths.length; i++) {
        hashedFilePaths[paths[i]] = newPaths[i];
    }
    return hashedFilePaths;
}
async function replacePlaceholders(rootDir, outDir, paths, hashedFilePaths, assetURL) {
    const promises = [];
    for (let i = 0; i < paths.length; i++) {
        promises.push((async function () {
            let outFile = await fs.readFile(paths[i]);
            let outTxt = "";
            if (/\.(?:html|css|js)$/.test(paths[i])) {
                outTxt = outFile
                    .toString("utf-8")
                    .replace(/({%)([^{}]+)(%})/g, (_, __, oldRelativePath) => {
                    const oldPath = path.resolve(path.dirname(paths[i]), oldRelativePath);
                    const newPath = hashedFilePaths[oldPath];
                    return assetURL + path.relative(rootDir, newPath);
                });
            }
            const outRelativePath = path.relative(rootDir, hashedFilePaths[paths[i]]);
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
async function main(rootDir, outDir, assetURL) {
    const filePaths = await getFilePaths(rootDir);
    const hashedFilePaths = await generateFileHashes(filePaths);
    await replacePlaceholders(rootDir, outDir, filePaths, hashedFilePaths, assetURL);
}
const args = process.argv;
if (args.length < 5) {
    throw new Error("Arguments rootDir, outDir, and assetURL have not been provided.");
}
await main(args[2], args[3], args[4]);
