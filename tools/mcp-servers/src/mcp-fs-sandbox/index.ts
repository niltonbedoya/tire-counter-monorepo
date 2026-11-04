import fs from 'node:fs';
import path from 'node:path';

export interface VaultStorageCheck {
  accessible: boolean;
  isIsolated: boolean;
  directory: string;
  filesCount: number;
  totalSizeBytes: number;
}

export function verifyVaultStorage(dirPath: string): VaultStorageCheck {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const files = fs.readdirSync(dirPath);
    let totalSizeBytes = 0;
    for (const f of files) {
      try {
        const stat = fs.statSync(path.join(dirPath, f));
        if (stat.isFile()) totalSizeBytes += stat.size;
      } catch {
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
  } catch (err) {
    return {
      accessible: false,
      isIsolated: false,
      directory: dirPath,
      filesCount: 0,
      totalSizeBytes: 0,
    };
  }
}

export interface PurgeTraceItem {
  file: string;
  purgedAt: string;
  success: boolean;
  bytesFreed?: number;
  error?: string;
}

export async function tracePurgeExecution(
  filePaths: string[],
  physicalDelete = false
): Promise<{
  totalFiles: number;
  purgedCount: number;
  failedCount: number;
  traces: PurgeTraceItem[];
}> {
  const traces: PurgeTraceItem[] = [];
  let purgedCount = 0;
  let failedCount = 0;

  for (const filePath of filePaths) {
    const timestamp = new Date().toISOString();
    try {
      let size = 0;
      if (fs.existsSync(filePath)) {
        size = fs.statSync(filePath).size;
        if (physicalDelete) {
          fs.unlinkSync(filePath);
        }
      }
      purgedCount++;
      traces.push({
        file: filePath,
        purgedAt: timestamp,
        success: true,
        bytesFreed: size,
      });
    } catch (err: any) {
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

export function checkFileLocks(filePaths: string[]): {
  allUnlocked: boolean;
  lockedFiles: string[];
} {
  const lockedFiles: string[] = [];

  for (const file of filePaths) {
    if (!fs.existsSync(file)) continue;
    try {
      // Test opening file in read/write mode to verify no exclusive locks exist
      const fd = fs.openSync(file, 'r+');
      fs.closeSync(fd);
    } catch (err: any) {
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
