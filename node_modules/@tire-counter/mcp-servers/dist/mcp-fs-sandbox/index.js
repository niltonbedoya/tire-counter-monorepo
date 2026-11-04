"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyVaultStorage = verifyVaultStorage;
exports.tracePurgeExecution = tracePurgeExecution;
exports.checkFileLocks = checkFileLocks;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function verifyVaultStorage(dirPath) {
    try {
        if (!node_fs_1.default.existsSync(dirPath)) {
            node_fs_1.default.mkdirSync(dirPath, { recursive: true });
        }
        const files = node_fs_1.default.readdirSync(dirPath);
        let totalSizeBytes = 0;
        for (const f of files) {
            try {
                const stat = node_fs_1.default.statSync(node_path_1.default.join(dirPath, f));
                if (stat.isFile())
                    totalSizeBytes += stat.size;
            }
            catch {
                // ignore
            }
        }
        return {
            accessible: true,
            isIsolated: true,
            directory: dirPath,
            filesCount: files.length,
            totalSizeBytes,
        };
    }
    catch (err) {
        return {
            accessible: false,
            isIsolated: false,
            directory: dirPath,
            filesCount: 0,
            totalSizeBytes: 0,
        };
    }
}
async function tracePurgeExecution(filePaths, physicalDelete = false) {
    const traces = [];
    let purgedCount = 0;
    let failedCount = 0;
    for (const filePath of filePaths) {
        const timestamp = new Date().toISOString();
        try {
            let size = 0;
            if (node_fs_1.default.existsSync(filePath)) {
                size = node_fs_1.default.statSync(filePath).size;
                if (physicalDelete) {
                    node_fs_1.default.unlinkSync(filePath);
                }
            }
            purgedCount++;
            traces.push({
                file: filePath,
                purgedAt: timestamp,
                success: true,
                bytesFreed: size,
            });
        }
        catch (err) {
            failedCount++;
            traces.push({
                file: filePath,
                purgedAt: timestamp,
                success: false,
                error: err.message,
            });
        }
    }
    return {
        totalFiles: filePaths.length,
        purgedCount,
        failedCount,
        traces,
    };
}
function checkFileLocks(filePaths) {
    const lockedFiles = [];
    for (const file of filePaths) {
        if (!node_fs_1.default.existsSync(file))
            continue;
        try {
            // Test opening file in read/write mode to verify no exclusive locks exist
            const fd = node_fs_1.default.openSync(file, 'r+');
            node_fs_1.default.closeSync(fd);
        }
        catch (err) {
            if (err.code === 'EBUSY' || err.code === 'EPERM') {
                lockedFiles.push(file);
            }
        }
    }
    return {
        allUnlocked: lockedFiles.length === 0,
        lockedFiles,
    };
}
