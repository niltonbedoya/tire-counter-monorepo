import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import crypto from 'node:crypto';

export async function parseXlsxStructure(buffer: Buffer | Uint8Array): Promise<{
  valid: boolean;
  sheets: string[];
  headers: string[];
  rowCount: number;
  error?: string;
}> {
  try {
    const workbook = new ExcelJS.Workbook();
    // @ts-ignore
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { valid: false, sheets: [], headers: [], rowCount: 0, error: 'No worksheets found' };
    }

    const sheets = workbook.worksheets.map((s) => s.name);
    // Locate table header (usually row 4 or 5 after metadata header)
    let headerRowNumber = 1;
    let headers: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      const values = row.values as any[];
      if (Array.isArray(values) && values.some((v) => typeof v === 'string' && (v.includes('Rim') || v.includes('Size') || v.includes('Llanta') || v.includes('Quantity')))) {
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
  } catch (err: any) {
    return {
      valid: false,
      sheets: [],
      headers: [],
      rowCount: 0,
      error: err.message,
    };
  }
}

export async function auditManifestTotals(
  buffer: Buffer | Uint8Array,
  expectedTotal: number
): Promise<{
  matches: boolean;
  excelSum: number;
  expectedTotal: number;
  difference: number;
}> {
  const workbook = new ExcelJS.Workbook();
  // @ts-ignore
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  let excelSum = 0;
  let qtyColIndex = -1;

  sheet.eachRow((row, rowNumber) => {
    const values = row.values as any[];
    if (qtyColIndex === -1 && Array.isArray(values)) {
      values.forEach((v, idx) => {
        if (typeof v === 'string' && (v.toLowerCase().includes('quantity') || v.toLowerCase().includes('cantidad') || v.toLowerCase().includes('qty'))) {
          qtyColIndex = idx;
        }
      });
    } else if (qtyColIndex !== -1) {
      const cellVal = row.getCell(qtyColIndex).value;
      if (typeof cellVal === 'number') {
        excelSum += cellVal;
      }
    }
  });

  return {
    matches: excelSum === expectedTotal,
    excelSum,
    expectedTotal,
    difference: Math.abs(excelSum - expectedTotal),
  };
}

export async function inspectZipArchive(zipBuffer: Buffer | Uint8Array): Promise<{
  valid: boolean;
  hasExcel: boolean;
  excelPath?: string;
  photoFiles: string[];
  totalFiles: number;
  sha256: string;
}> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const fileNames = Object.keys(zip.files);
  const excelFile = fileNames.find((name) => name.endsWith('.xlsx'));
  const photoFiles = fileNames.filter((name) => name.endsWith('.webp') || name.startsWith('fotos/'));

  const buf = Buffer.isBuffer(zipBuffer) ? zipBuffer : Buffer.from(zipBuffer);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  return {
    valid: excelFile !== undefined,
    hasExcel: excelFile !== undefined,
    excelPath: excelFile,
    photoFiles,
    totalFiles: fileNames.length,
    sha256,
  };
}
