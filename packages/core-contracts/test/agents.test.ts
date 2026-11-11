import { describe, it, expect } from 'vitest';
import { processImageBuffer } from '../src/agents/processor';
import { compileOpenXmlManifest, generateDispatchZip } from '../src/agents/list-packer';
import { ProyectoContenedor, ItemNeumatico } from '../src/types';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

describe('Agent Implementations - Processor & List Packer Suite', () => {
  it('test_processor_compression_and_dimensions: simulates 4K buffer (3840x2160, ~6MB), asserts WebP, dimension <= 1280 px and size < 153.600 bytes', () => {
    // 6 MB buffer simulating 4K raw capture
    const rawBuffer = Buffer.alloc(6 * 1024 * 1024);
    rawBuffer.fill(0x3a);

    const { evidencia, webpBuffer } = processImageBuffer({
      contenedorId: 'cnt-proc-01',
      rawBuffer,
      originalWidth: 3840,
      originalHeight: 2160,
    });

    expect(evidencia.formato).toBe('image/webp');
    expect(evidencia.dimensionMaxPx).toBeLessThanOrEqual(1280);
    expect(evidencia.pesoBytes).toBeLessThan(153600);
    expect(webpBuffer.length).toBeLessThan(153600);

    // Verify RIFF header
    expect(webpBuffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(webpBuffer.toString('ascii', 8, 12)).toBe('WEBP');
  });

  it('test_list_packer_openxml_exact_sum_and_lang: builds 15 distinct sizes totaling 1450 tires under Russian UI, verifies Visual Matrix & English Detailed Manifest', async () => {
    const contenedor: ProyectoContenedor = {
      id: 'cnt-packer-01',
      codigoReferencia: 'Contenedor RU-7788',
      operarioId: 'op-ru-01',
      nombreOperarioSnapshot: 'Иван Петров (Ivan Petrov)',
      estado: 'ACTIVO',
      totalAcumulado: 1450,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 15 distinct tire sizes distributing 1,450 tires
    const quantities = [100, 150, 80, 120, 90, 70, 110, 130, 85, 95, 105, 115, 65, 75, 60];
    expect(quantities.reduce((a, b) => a + b, 0)).toBe(1450);

    const items: ItemNeumatico[] = quantities.map((qty, idx) => {
      const rim = 13 + (idx % 8); // 13, 14, 15, 16, 17, 18, 19, 20
      const width = 175 + (idx * 5);
      const profile = 50 + ((idx % 5) * 5);
      return {
        id: `item-${idx + 1}`,
        contenedorId: contenedor.id,
        llanta: rim,
        ancho: width,
        perfil: profile,
        marca: idx % 2 === 0 ? 'Michelin' : 'Bridgestone',
        claveCompuesta: `${width}/${profile}R${rim}--${idx % 2 === 0 ? 'Michelin' : 'Bridgestone'}`,
        cantidad: qty,
        updatedAt: new Date().toISOString(),
      };
    });

    const excelBuffer = await compileOpenXmlManifest(contenedor, items);
    expect(excelBuffer.length).toBeGreaterThan(0);

    // Validate with ExcelJS
    const workbook = new ExcelJS.Workbook();
    // @ts-ignore
    await workbook.xlsx.load(excelBuffer);

    // 1. Verify two worksheets exist: Visual Matrix and Detailed Manifest
    expect(workbook.worksheets.length).toBe(2);

    const visualSheet = workbook.worksheets[0];
    expect(visualSheet.name).toBe('Packing List');

    // Visual sheet banner verification
    expect(visualSheet.getCell('A1').value).toContain('CHEKIN');
    expect(visualSheet.getCell('A2').value).toContain('Contenedor RU-7788');

    // Check presence of rim bucket headers in visual sheet
    expect(visualSheet.getCell('A4').value).toBe('12,13,14');
    expect(visualSheet.getCell('D4').value).toBe('16');
    expect(visualSheet.getCell('G4').value).toBe('18-19');

    // 2. Validate Detailed Manifest sheet
    const detailedSheet = workbook.worksheets[1];
    expect(detailedSheet.name).toBe('Detailed Manifest');

    // Check international English headers
    const headerRow = detailedSheet.getRow(4);
    const headerValues = (headerRow.values as any[]).filter(Boolean).map(String);
    expect(headerValues).toContain('Rim (in)');
    expect(headerValues).toContain('Width (mm)');
    expect(headerValues).toContain('Profile (%)');
    expect(headerValues).toContain('Quantity (PCS)');

    // Check mathematical sum from detailed cells
    let cellSum = 0;
    detailedSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 4 && rowNumber <= 4 + 15) {
        const val = row.getCell(7).value;
        if (typeof val === 'number') {
          cellSum += val;
        }
      }
    });
    expect(cellSum).toBe(1450);

    // Check full zip package generation
    const paquete = await generateDispatchZip({
      contenedor,
      items,
      fotos: [],
    });

    expect(paquete.sha256).toHaveLength(64);
    expect(paquete.totalNeumaticos).toBe(1450);

    // Inspect zip contents
    const zip = await JSZip.loadAsync(paquete.bufferZip);
    const fileList = Object.keys(zip.files);
    expect(fileList.some((f) => f.endsWith('.xlsx'))).toBe(true);
  });

  it('test_list_packer_reproduces_real_container_manifest_from_sample: tests exact 2233 tire dataset across 6 buckets', async () => {
    const contenedor: ProyectoContenedor = {
      id: 'cnt-tcnu-387369-4',
      codigoReferencia: 'TCNU 387369 4',
      operarioId: 'op-01',
      nombreOperarioSnapshot: 'Supervisor Patio',
      estado: 'ACTIVO',
      totalAcumulado: 2233,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Real tire dataset matching the sample image exactly (2233 tires)
    const rawData: Array<{ w: number; p: number; r: number; q: number }> = [
      // 12,13,14 (total: 144)
      { w: 145, p: 80, r: 12, q: 25 }, // 5 00 r12
      { w: 155, p: 80, r: 13, q: 15 }, // 550 R 13
      { w: 175, p: 70, r: 13, q: 18 },
      { w: 175, p: 65, r: 14, q: 12 },
      { w: 175, p: 70, r: 14, q: 10 },
      { w: 185, p: 65, r: 14, q: 37 },
      { w: 185, p: 80, r: 14, q: 10 }, // 185 R14
      { w: 195, p: 70, r: 14, q: 15 },
      { w: 205, p: 70, r: 14, q: 2 },
      // 16 (total: 856)
      { w: 195, p: 45, r: 16, q: 5 },
      { w: 205, p: 55, r: 16, q: 30 },
      { w: 205, p: 60, r: 16, q: 31 },
      { w: 205, p: 65, r: 16, q: 263 },
      { w: 215, p: 60, r: 16, q: 103 },
      { w: 215, p: 70, r: 16, q: 101 },
      { w: 215, p: 65, r: 16, q: 9 },
      { w: 225, p: 70, r: 16, q: 58 },
      { w: 235, p: 60, r: 16, q: 40 },
      { w: 235, p: 70, r: 16, q: 12 },
      { w: 245, p: 70, r: 16, q: 75 },
      { w: 255, p: 65, r: 16, q: 104 },
      { w: 225, p: 75, r: 16, q: 2 },
      { w: 225, p: 65, r: 16, q: 15 },
      { w: 205, p: 75, r: 16, q: 2 },
      { w: 195, p: 55, r: 16, q: 6 },
      // 18-19 (total: 375)
      { w: 225, p: 40, r: 18, q: 2 },
      { w: 225, p: 45, r: 18, q: 38 },
      { w: 235, p: 45, r: 18, q: 47 },
      { w: 235, p: 55, r: 18, q: 22 },
      { w: 235, p: 60, r: 18, q: 65 },
      { w: 245, p: 40, r: 18, q: 6 },
      { w: 245, p: 45, r: 18, q: 134 },
      { w: 245, p: 60, r: 18, q: 10 },
      { w: 255, p: 60, r: 18, q: 30 },
      { w: 265, p: 60, r: 18, q: 7 },
      { w: 255, p: 55, r: 18, q: 14 },
      // 15 (total: 436)
      { w: 195, p: 80, r: 15, q: 18 }, // 195 R15
      { w: 195, p: 70, r: 15, q: 37 },
      { w: 185, p: 65, r: 15, q: 24 },
      { w: 195, p: 55, r: 15, q: 35 },
      { w: 195, p: 65, r: 15, q: 75 },
      { w: 205, p: 65, r: 15, q: 73 },
      { w: 205, p: 70, r: 15, q: 61 },
      { w: 215, p: 65, r: 15, q: 61 },
      { w: 215, p: 70, r: 15, q: 7 },
      { w: 255, p: 70, r: 15, q: 34 },
      { w: 235, p: 75, r: 15, q: 6 },
      { w: 280, p: 80, r: 15, q: 2 },
      { w: 165, p: 80, r: 15, q: 1 },
      { w: 215, p: 75, r: 15, q: 2 },
      // 17 (total: 374)
      { w: 205, p: 55, r: 17, q: 3 },
      { w: 215, p: 45, r: 17, q: 50 },
      { w: 215, p: 50, r: 17, q: 40 },
      { w: 215, p: 55, r: 17, q: 60 },
      { w: 215, p: 65, r: 17, q: 4 },
      { w: 225, p: 45, r: 17, q: 50 },
      { w: 235, p: 55, r: 17, q: 60 },
      { w: 235, p: 65, r: 17, q: 47 },
      { w: 245, p: 65, r: 17, q: 8 },
      { w: 235, p: 60, r: 17, q: 32 },
      { w: 225, p: 60, r: 17, q: 20 },
      // 19+ (total: 48)
      { w: 245, p: 40, r: 19, q: 4 },
      { w: 235, p: 55, r: 19, q: 28 },
      { w: 245, p: 40, r: 20, q: 4 },
      { w: 245, p: 50, r: 20, q: 3 },
      { w: 255, p: 55, r: 20, q: 2 },
      { w: 255, p: 50, r: 20, q: 4 },
      { w: 265, p: 50, r: 20, q: 1 },
      { w: 265, p: 40, r: 22, q: 2 },
    ];

    const items: ItemNeumatico[] = rawData.map((d, i) => ({
      id: `item-${i + 1}`,
      contenedorId: contenedor.id,
      llanta: d.r,
      ancho: d.w,
      perfil: d.p,
      marca: '',
      claveCompuesta: `${d.w}/${d.p}R${d.r}--GENERICA`,
      cantidad: d.q,
      updatedAt: new Date().toISOString(),
    }));

    const totalQty = items.reduce((sum, it) => sum + it.cantidad, 0);
    expect(totalQty).toBe(2233);

    const excelBuffer = await compileOpenXmlManifest(contenedor, items);
    expect(excelBuffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    // @ts-ignore
    await workbook.xlsx.load(excelBuffer);

    const visualSheet = workbook.worksheets[0];
    expect(visualSheet.name).toBe('Packing List');

    // Confirm banner header
    expect(visualSheet.getCell('A1').value).toBe('CHEKIN. TCNU 387369 4');

    // Confirm Grand Total in the visual matrix
    // Row 22 is tier 1 subtotal (max tier1 is 16 data rows, starts at 5 -> 5+16 = 21, subtotal = 21, etc.)
    const totalRowsCount = visualSheet.rowCount;
    const grandTotalCell = visualSheet.getCell(`H${totalRowsCount}`);
    const cellVal = grandTotalCell.value as any;
    expect(cellVal.result).toBe(2233);
  });
});
