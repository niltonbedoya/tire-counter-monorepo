export declare function parseXlsxStructure(buffer: Buffer | Uint8Array): Promise<{
    valid: boolean;
    sheets: string[];
    headers: string[];
    rowCount: number;
    error?: string;
}>;
export declare function auditManifestTotals(buffer: Buffer | Uint8Array, expectedTotal: number): Promise<{
    matches: boolean;
    excelSum: number;
    expectedTotal: number;
    difference: number;
}>;
export declare function inspectZipArchive(zipBuffer: Buffer | Uint8Array): Promise<{
    valid: boolean;
    hasExcel: boolean;
    excelPath?: string;
    photoFiles: string[];
    totalFiles: number;
    sha256: string;
}>;
