import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import crypto from 'node:crypto';
import { ProyectoContenedor, ItemNeumatico, EvidenciaFoto, PaqueteDespacho } from '../types';

export interface ListPackerInput {
  contenedor: ProyectoContenedor;
  items: ItemNeumatico[];
  fotos?: Array<{ evidencia: EvidenciaFoto; buffer: Buffer | Uint8Array }>;
}

export function formatTireDimension(item: ItemNeumatico): string {
  if (item.perfil === 0 || item.perfil === 80 || item.perfil === 82) {
    const base = `${item.ancho} R${item.llanta}`;
    return item.marca && item.marca !== 'GENERICA' ? `${base} ${item.marca}` : base;
  }
  const base = `${item.ancho} ${item.perfil} ${item.llanta}`;
  return item.marca && item.marca !== 'GENERICA' ? `${base} ${item.marca}` : base;
}

export async function compileOpenXmlManifest(
  contenedor: ProyectoContenedor,
  items: ItemNeumatico[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Counter Logistics System';
  workbook.created = new Date();

  const today = new Date();
  const dateFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    left: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    right: { style: 'thin', color: { argb: 'FFD0D5DD' } },
  };

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE24A3B' }, // Warm coral / red matching warehouse check-in sheet
  };

  const columnHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F4F7' }, // Soft grey for table headers
  };

  const subtotalFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2E86C1' }, // Vivid blue for subtotal pills
  };

  // Standard sorting rule: Width (Ancho) ASC -> Profile (Perfil) ASC -> Rim (Llanta) ASC
  const sortByWidthProfileRim = (a: ItemNeumatico, b: ItemNeumatico) => {
    if (a.ancho !== b.ancho) return a.ancho - b.ancho;
    if (a.perfil !== b.perfil) return a.perfil - b.perfil;
    return a.llanta - b.llanta;
  };

  // =========================================================================
  // WORKSHEET 1: PACKING LIST (VISUAL MATRIX - PRINT READY ON 1 PAGE)
  // =========================================================================
  const visualSheet = workbook.addWorksheet('Packing List', {
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  // Set column widths
  visualSheet.columns = [
    { key: 'dim1', width: 14 },
    { key: 'qty1', width: 8 },
    { key: 'gap1', width: 2 },
    { key: 'dim2', width: 14 },
    { key: 'qty2', width: 8 },
    { key: 'gap2', width: 2 },
    { key: 'dim3', width: 14 },
    { key: 'qty3', width: 8 },
  ];

  // Header Banner: Row 1 & 2
  visualSheet.mergeCells('A1:H1');
  const bannerRow1 = visualSheet.getCell('A1');
  bannerRow1.value = `CHEKIN. ${contenedor.codigoReferencia.toUpperCase()}`;
  bannerRow1.fill = headerFill;
  bannerRow1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  bannerRow1.alignment = { horizontal: 'center', vertical: 'middle' };
  visualSheet.getRow(1).height = 24;

  visualSheet.mergeCells('A2:H2');
  const bannerRow2 = visualSheet.getCell('A2');
  bannerRow2.value = `${contenedor.codigoReferencia} (${dateFormatted})`;
  bannerRow2.fill = headerFill;
  bannerRow2.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  bannerRow2.alignment = { horizontal: 'center', vertical: 'middle' };
  visualSheet.getRow(2).height = 20;

  // Row 3: Blank separator
  visualSheet.getRow(3).height = 8;

  // Partition items into the 6 standard industry buckets sorted by Width -> Profile -> Rim:
  const bucket1 = items.filter((i) => i.llanta <= 14).sort(sortByWidthProfileRim);
  const bucket2 = items.filter((i) => i.llanta === 15).sort(sortByWidthProfileRim);
  const bucket3 = items.filter((i) => i.llanta === 16).sort(sortByWidthProfileRim);
  const bucket4 = items.filter((i) => i.llanta === 17).sort(sortByWidthProfileRim);
  const bucket5 = items.filter((i) => i.llanta === 18).sort(sortByWidthProfileRim);
  const bucket6 = items.filter((i) => i.llanta >= 19).sort(sortByWidthProfileRim);

  // Helper to apply borders and formatting to a cell
  const setCell = (
    rowNum: number,
    colLetter: string,
    val: any,
    options: {
      bold?: boolean;
      color?: string;
      align?: ExcelJS.Alignment['horizontal'];
      fill?: ExcelJS.Fill;
      formula?: string;
    } = {}
  ) => {
    const cell = visualSheet.getCell(`${colLetter}${rowNum}`);
    if (options.formula) {
      cell.value = { formula: options.formula, result: val };
    } else {
      cell.value = val;
    }
    cell.border = thinBorder;
    cell.font = {
      bold: !!options.bold,
      color: options.color ? { argb: options.color } : undefined,
      size: 10,
    };
    if (options.align) {
      cell.alignment = { horizontal: options.align, vertical: 'middle' };
    }
    if (options.fill) {
      cell.fill = options.fill;
    }
    return cell;
  };

  // -------------------------------------------------------------------------
  // TIER 1 RENDERING
  // -------------------------------------------------------------------------
  const tier1HeaderRow = 4;
  visualSheet.getRow(tier1HeaderRow).height = 20;

  // Header 1: 12,13,14
  visualSheet.mergeCells(`A${tier1HeaderRow}:B${tier1HeaderRow}`);
  const h1 = visualSheet.getCell(`A${tier1HeaderRow}`);
  h1.value = '12,13,14';
  h1.font = { bold: true, size: 10 };
  h1.alignment = { horizontal: 'center', vertical: 'middle' };
  h1.fill = columnHeaderFill;
  h1.border = thinBorder;
  visualSheet.getCell(`B${tier1HeaderRow}`).border = thinBorder;

  // Header 2: 16
  visualSheet.mergeCells(`D${tier1HeaderRow}:E${tier1HeaderRow}`);
  const h2 = visualSheet.getCell(`D${tier1HeaderRow}`);
  h2.value = '16';
  h2.font = { bold: true, size: 10 };
  h2.alignment = { horizontal: 'center', vertical: 'middle' };
  h2.fill = columnHeaderFill;
  h2.border = thinBorder;
  visualSheet.getCell(`E${tier1HeaderRow}`).border = thinBorder;

  // Header 3: 18-19
  visualSheet.mergeCells(`G${tier1HeaderRow}:H${tier1HeaderRow}`);
  const h3 = visualSheet.getCell(`G${tier1HeaderRow}`);
  h3.value = '18-19';
  h3.font = { bold: true, size: 10 };
  h3.alignment = { horizontal: 'center', vertical: 'middle' };
  h3.fill = columnHeaderFill;
  h3.border = thinBorder;
  visualSheet.getCell(`H${tier1HeaderRow}`).border = thinBorder;

  const maxTier1 = Math.max(bucket1.length, bucket3.length, bucket5.length, 1);
  const tier1DataStart = 5;

  for (let i = 0; i < maxTier1; i++) {
    const r = tier1DataStart + i;
    visualSheet.getRow(r).height = 18;

    // Col 1 (Bucket 1)
    const it1 = bucket1[i];
    setCell(r, 'A', it1 ? formatTireDimension(it1) : '', { align: 'left' });
    setCell(r, 'B', it1 ? it1.cantidad : '', { bold: true, color: 'FFC0392B', align: 'center' });

    // Col 2 (Bucket 3)
    const it3 = bucket3[i];
    setCell(r, 'D', it3 ? formatTireDimension(it3) : '', { align: 'left' });
    setCell(r, 'E', it3 ? it3.cantidad : '', { bold: true, color: 'FFC0392B', align: 'center' });

    // Col 3 (Bucket 5)
    const it5 = bucket5[i];
    setCell(r, 'G', it5 ? formatTireDimension(it5) : '', { align: 'left' });
    setCell(r, 'H', it5 ? it5.cantidad : '', { bold: true, color: 'FFC0392B', align: 'center' });
  }

  // Tier 1 Subtotal Row
  const tier1SubtotalRow = tier1DataStart + maxTier1;
  visualSheet.getRow(tier1SubtotalRow).height = 20;

  const sumB1 = bucket1.reduce((sum, it) => sum + it.cantidad, 0);
  const sumB3 = bucket3.reduce((sum, it) => sum + it.cantidad, 0);
  const sumB5 = bucket5.reduce((sum, it) => sum + it.cantidad, 0);

  // Col 1 Subtotal
  setCell(tier1SubtotalRow, 'A', '', {});
  setCell(tier1SubtotalRow, 'B', sumB1, {
    formula: `SUM(B${tier1DataStart}:B${tier1SubtotalRow - 1})`,
    bold: true,
    color: 'FFFFFFFF',
    align: 'center',
    fill: subtotalFill,
  });

  // Col 2 Subtotal
  setCell(tier1SubtotalRow, 'D', '', {});
  setCell(tier1SubtotalRow, 'E', sumB3, {
    formula: `SUM(E${tier1DataStart}:E${tier1SubtotalRow - 1})`,
    bold: true,
    color: 'FFFFFFFF',
    align: 'center',
    fill: subtotalFill,
  });

  // Col 3 Subtotal
  setCell(tier1SubtotalRow, 'G', '', {});
  setCell(tier1SubtotalRow, 'H', sumB5, {
    formula: `SUM(H${tier1DataStart}:H${tier1SubtotalRow - 1})`,
    bold: true,
    color: 'FFFFFFFF',
    align: 'center',
    fill: subtotalFill,
  });

  // Spacer between tiers
  const tierSpacerRow = tier1SubtotalRow + 1;
  visualSheet.getRow(tierSpacerRow).height = 10;

  // -------------------------------------------------------------------------
  // TIER 2 RENDERING
  // -------------------------------------------------------------------------
  const tier2HeaderRow = tierSpacerRow + 1;
  visualSheet.getRow(tier2HeaderRow).height = 20;

  // Header 1: 15
  visualSheet.mergeCells(`A${tier2HeaderRow}:B${tier2HeaderRow}`);
  const h4 = visualSheet.getCell(`A${tier2HeaderRow}`);
  h4.value = '15';
  h4.font = { bold: true, size: 10 };
  h4.alignment = { horizontal: 'center', vertical: 'middle' };
  h4.fill = columnHeaderFill;
  h4.border = thinBorder;
  visualSheet.getCell(`B${tier2HeaderRow}`).border = thinBorder;

  // Header 2: 17
  visualSheet.mergeCells(`D${tier2HeaderRow}:E${tier2HeaderRow}`);
  const h5 = visualSheet.getCell(`D${tier2HeaderRow}`);
  h5.value = '17';
  h5.font = { bold: true, size: 10 };
  h5.alignment = { horizontal: 'center', vertical: 'middle' };
  h5.fill = columnHeaderFill;
  h5.border = thinBorder;
  visualSheet.getCell(`E${tier2HeaderRow}`).border = thinBorder;

  // Header 3: 19
  visualSheet.mergeCells(`G${tier2HeaderRow}:H${tier2HeaderRow}`);
  const h6 = visualSheet.getCell(`G${tier2HeaderRow}`);
  h6.value = '19';
  h6.font = { bold: true, size: 10 };
  h6.alignment = { horizontal: 'center', vertical: 'middle' };
  h6.fill = columnHeaderFill;
  h6.border = thinBorder;
  visualSheet.getCell(`H${tier2HeaderRow}`).border = thinBorder;

  const maxTier2 = Math.max(bucket2.length, bucket4.length, bucket6.length, 1);
  const tier2DataStart = tier2HeaderRow + 1;

  for (let j = 0; j < maxTier2; j++) {
    const r2 = tier2DataStart + j;
    visualSheet.getRow(r2).height = 18;

    // Col 1 (Bucket 2)
    const it2 = bucket2[j];
    setCell(r2, 'A', it2 ? formatTireDimension(it2) : '', { align: 'left' });
    setCell(r2, 'B', it2 ? it2.cantidad : '', { bold: true, color: 'FFC0392B', align: 'center' });

    // Col 2 (Bucket 4)
    const it4 = bucket4[j];
    setCell(r2, 'D', it4 ? formatTireDimension(it4) : '', { align: 'left' });
    setCell(r2, 'E', it4 ? it4.cantidad : '', { bold: true, color: 'FFC0392B', align: 'center' });

    // Col 3 (Bucket 6)
    const it6 = bucket6[j];
    setCell(r2, 'G', it6 ? formatTireDimension(it6) : '', { align: 'left' });
    setCell(r2, 'H', it6 ? it6.cantidad : '', { bold: true, color: 'FFC0392B', align: 'center' });
  }

  // Tier 2 Subtotal Row
  const tier2SubtotalRow = tier2DataStart + maxTier2;
  visualSheet.getRow(tier2SubtotalRow).height = 20;

  const sumB2 = bucket2.reduce((sum, it) => sum + it.cantidad, 0);
  const sumB4 = bucket4.reduce((sum, it) => sum + it.cantidad, 0);
  const sumB6 = bucket6.reduce((sum, it) => sum + it.cantidad, 0);

  // Col 1 Subtotal
  setCell(tier2SubtotalRow, 'A', '', {});
  setCell(tier2SubtotalRow, 'B', sumB2, {
    formula: `SUM(B${tier2DataStart}:B${tier2SubtotalRow - 1})`,
    bold: true,
    color: 'FFFFFFFF',
    align: 'center',
    fill: subtotalFill,
  });

  // Col 2 Subtotal
  setCell(tier2SubtotalRow, 'D', '', {});
  setCell(tier2SubtotalRow, 'E', sumB4, {
    formula: `SUM(E${tier2DataStart}:E${tier2SubtotalRow - 1})`,
    bold: true,
    color: 'FFFFFFFF',
    align: 'center',
    fill: subtotalFill,
  });

  // Col 3 Subtotal
  setCell(tier2SubtotalRow, 'G', '', {});
  setCell(tier2SubtotalRow, 'H', sumB6, {
    formula: `SUM(H${tier2DataStart}:H${tier2SubtotalRow - 1})`,
    bold: true,
    color: 'FFFFFFFF',
    align: 'center',
    fill: subtotalFill,
  });

  // Grand Total Calculation
  const grandTotal = sumB1 + sumB2 + sumB3 + sumB4 + sumB5 + sumB6;

  // Grand Total Cell
  const totalRow = tier2SubtotalRow + 1;
  visualSheet.getRow(totalRow).height = 24;

  const lblTotal = visualSheet.getCell(`G${totalRow}`);
  lblTotal.value = 'TOTAL';
  lblTotal.font = { bold: true, size: 11 };
  lblTotal.alignment = { horizontal: 'right', vertical: 'middle' };

  const cellTotal = visualSheet.getCell(`H${totalRow}`);
  cellTotal.value = {
    formula: `B${tier1SubtotalRow}+E${tier1SubtotalRow}+H${tier1SubtotalRow}+B${tier2SubtotalRow}+E${tier2SubtotalRow}+H${tier2SubtotalRow}`,
    result: grandTotal,
  };
  cellTotal.font = { bold: true, size: 13, color: { argb: 'FF000000' } };
  cellTotal.alignment = { horizontal: 'center', vertical: 'middle' };
  cellTotal.border = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'double', color: { argb: 'FF000000' } },
  };

  // =========================================================================
  // WORKSHEET 2: DETAILED MANIFEST (TABULAR CUSTOMS / ERP VIEW)
  // Column order strictly: Width (mm), Profile (%), Rim (in)
  // =========================================================================
  const manifestSheet = workbook.addWorksheet('Detailed Manifest', {
    pageSetup: { orientation: 'portrait', paperSize: 9 },
  });

  manifestSheet.columns = [
    { key: 'line', width: 8 },
    { key: 'width', width: 14 },
    { key: 'profile', width: 14 },
    { key: 'rim', width: 12 },
    { key: 'brand', width: 18 },
    { key: 'key', width: 28 },
    { key: 'qty', width: 16 },
  ];

  // 1. Encabezado logístico internacional bilingüe / inglés (RF-06)
  manifestSheet.addRow(['TIRE PACKING LIST / MANIFEST DE CARGA']);
  manifestSheet.addRow([
    `Container Code: ${contenedor.codigoReferencia}`,
    `Operator: ${contenedor.nombreOperarioSnapshot}`,
    `Date: ${today.toISOString().split('T')[0]}`,
  ]);
  manifestSheet.addRow([]);

  // Estilo de encabezados de columnas (Row 4): Width, Profile, Rim
  const headerRow = manifestSheet.addRow([
    'Line',
    'Width (mm)',
    'Profile (%)',
    'Rim (in)',
    'Brand',
    'Composite Key',
    'Quantity (PCS)',
  ]);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // 2. Filas ordenadas por Width asc, luego Profile asc, luego Rim asc
  const sortedItems = [...items].sort(sortByWidthProfileRim);

  let lineNo = 1;
  let totalCalculado = 0;
  const dataStartRow = 5;

  for (const item of sortedItems) {
    totalCalculado += item.cantidad;
    const r = manifestSheet.addRow([
      lineNo++,
      item.ancho,
      item.perfil,
      item.llanta,
      item.marca || 'GENERICA',
      item.claveCompuesta,
      item.cantidad,
    ]);
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(3).alignment = { horizontal: 'center' };
    r.getCell(4).alignment = { horizontal: 'center' };
    r.getCell(7).alignment = { horizontal: 'right' };
  }

  const lastDataRow = dataStartRow + sortedItems.length - 1;

  // Fila de Total con fórmula nativa
  const totalRowManifest = manifestSheet.addRow([
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    sortedItems.length > 0
      ? { formula: `SUM(G${dataStartRow}:G${lastDataRow})`, result: totalCalculado }
      : 0,
  ]);
  totalRowManifest.font = { bold: true };
  totalRowManifest.getCell(7).alignment = { horizontal: 'right' };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateDispatchZip(input: ListPackerInput): Promise<PaqueteDespacho> {
  const { contenedor, items, fotos = [] } = input;

  // Generar Excel con doble pestaña (Packing List Visual + Detailed Manifest)
  const excelBuffer = await compileOpenXmlManifest(contenedor, items);

  // Empaquetar en ZIP
  const zip = new JSZip();
  const manifestFileName = `manifest_${contenedor.codigoReferencia.replace(/\s+/g, '_')}.xlsx`;
  zip.file(manifestFileName, excelBuffer);

  const fotosFolder = zip.folder('fotos');
  for (const f of fotos) {
    const name = f.evidencia.rutaLocal.split('/').pop() || `${f.evidencia.id}.webp`;
    fotosFolder?.file(name, f.buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const sha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');
  const totalNeumaticos = items.reduce((sum, i) => sum + i.cantidad, 0);

  return {
    loteId: contenedor.id,
    archivoNombre: `despacho_${contenedor.codigoReferencia.replace(/\s+/g, '_')}.zip`,
    bufferZip: zipBuffer,
    sha256,
    fotosCount: fotos.length,
    totalNeumaticos,
    timestamp: new Date().toISOString(),
  };
}
