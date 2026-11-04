export interface VaultStorageCheck {
    accessible: boolean;
    isIsolated: boolean;
    directory: string;
    filesCount: number;
    totalSizeBytes: number;
}
export declare function verifyVaultStorage(dirPath: string): VaultStorageCheck;
export interface PurgeTraceItem {
    file: string;
    purgedAt: string;
    success: boolean;
    bytesFreed?: number;
    error?: string;
}
export declare function tracePurgeExecution(filePaths: string[], physicalDelete?: boolean): Promise<{
    totalFiles: number;
    purgedCount: number;
    failedCount: number;
    traces: PurgeTraceItem[];
}>;
export declare function checkFileLocks(filePaths: string[]): {
    allUnlocked: boolean;
    lockedFiles: string[];
};
