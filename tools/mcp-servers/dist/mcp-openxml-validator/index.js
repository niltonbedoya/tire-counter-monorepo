"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseXlsxStructure = parseXlsxStructure;
exports.auditManifestTotals = auditManifestTotals;
exports.inspectZipArchive = inspectZipArchive;
const exceljs_1 = __importDefault(require("exceljs"));
const jszip_1 = __importDefault(require("jszip"));
const node_crypto_1 = __importDefault(require("node:crypto"));
async function parseXlsxStructure(buffer) {
    try {
        const workbook = new exceljs_1.default.Workbook();
        // @ts-ignore
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets.find((s) => s.name.toLowerCase().includes('detail') || s.name.toLowerCase().includes('manifest')) || workbook.worksheets[0];
        if (!sheet) {
            return { valid: false, sheets: [], headers: [], rowCount: 0, error: 'No worksheets found' };
        }
        const sheets = workbook.worksheets.map((s) => s.name);
        // Locate table header (usually row 4 or 5 after metadata header)
        let headerRowNumber = 1;
        let headers = [];
        sheet.eachRow((row, rowNumber) => {
            const values = row.values;
            if (Array.isArray(values) &&
                values.some((v) => typeof v === 'string' &&
                    (v.includes('Rim') || v.includes('Size') || v.includes('Llanta') || v.includes('Quantity')))) {
                headerRowNumber = rowNumber;
                headers = values.filter(Boolean).map(String);
            }
        });
        return {
            valid: true,
            sheets,
            headers,
            rowCount: sheet.rowCount,
        };
    }
    catch (err) {
        return {
            valid: false,
            sheets: [],
            headers: [],
            rowCount: 0,
            error: err.message,
        };
    }
}
async function auditManifestTotals(buffer, expectedTotal) {
    const workbook = new exceljs_1.default.Workbook();
    // @ts-ignore
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets.find((s) => s.name.toLowerCase().includes('detail') || s.name.toLowerCase().includes('manifest')) || workbook.worksheets[0];
    let excelSum = 0;
    let qtyColIndex = -1;
    sheet.eachRow((row, rowNumber) => {
        const values = row.values;
        // Skip the summary TOTAL row to avoid double counting if present
        if (Array.isArray(values) &&
            values.some((v) => typeof v === 'string' &&
                (v.trim().toUpperCase() === 'TOTAL' || v.trim().toUpperCase() === 'GRAN TOTAL'))) {
            return;
        }
        if (qtyColIndex === -1 && Array.isArray(values)) {
            values.forEach((v, idx) => {
                if (typeof v === 'string' &&
                    (v.toLowerCase().includes('quantity') ||
                        v.toLowerCase().includes('cantidad') ||
                        v.toLowerCase().includes('qty'))) {
                    qtyColIndex = idx;
                }
            });
        }
        else if (qtyColIndex !== -1) {
            const cellVal = row.getCell(qtyColIndex).value;
            const num = typeof cellVal === 'number'
                ? cellVal
                : cellVal && typeof cellVal === 'object' && typeof cellVal.result === 'number'
                    ? cellVal.result
                    : 0;
            excelSum += num;
        }
    });
    return {
        matches: excelSum === expectedTotal,
        excelSum,
        expectedTotal,
        difference: Math.abs(excelSum - expectedTotal),
    };
}
async function inspectZipArchive(zipBuffer) {
    const zip = await jszip_1.default.loadAsync(zipBuffer);
    const fileNames = Object.keys(zip.files);
    const excelFile = fileNames.find((name) => name.endsWith('.xlsx'));
    const photoFiles = fileNames.filter((name) => name.endsWith('.webp') || name.startsWith('fotos/'));
    const buf = Buffer.isBuffer(zipBuffer) ? zipBuffer : Buffer.from(zipBuffer);
    const sha256 = node_crypto_1.default.createHash('sha256').update(buf).digest('hex');
    return {
        valid: excelFile !== undefined,
        hasExcel: excelFile !== undefined,
        excelPath: excelFile,
        photoFiles,
        totalFiles: fileNames.length,
        sha256,
    };
}
