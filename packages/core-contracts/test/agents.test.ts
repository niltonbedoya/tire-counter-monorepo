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

  it('test_list_packer_openxml_exact_sum_and_lang: builds 15 distinct sizes totaling 1450 tires under Russian UI, verifies English headers and exact sum 1450', async () => {
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
    const sheet = workbook.worksheets[0];

    // Check international English headers
    const headerRow = sheet.getRow(4);
    const headerValues = (headerRow.values as any[]).filter(Boolean).map(String);
    expect(headerValues).toContain('Rim (in)');
    expect(headerValues).toContain('Width (mm)');
    expect(headerValues).toContain('Profile (%)');
    expect(headerValues).toContain('Quantity (PCS)');

    // Check mathematical sum from cells
    let cellSum = 0;
    // Quantity column is index 7
    sheet.eachRow((row, rowNumber) => {
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
});
