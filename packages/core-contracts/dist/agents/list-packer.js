"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileOpenXmlManifest = compileOpenXmlManifest;
exports.generateDispatchZip = generateDispatchZip;
const exceljs_1 = __importDefault(require("exceljs"));
const jszip_1 = __importDefault(require("jszip"));
const node_crypto_1 = __importDefault(require("node:crypto"));
async function compileOpenXmlManifest(contenedor, items) {
    const workbook = new exceljs_1.default.Workbook();
    workbook.creator = 'Counter Logistics System';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Packing List', {
        pageSetup: { orientation: 'portrait', paperSize: 9 },
    });
    // 1. Encabezado logístico internacional bilingüe / inglés (RF-06)
    worksheet.addRow(['TIRE PACKING LIST / MANIFEST DE CARGA']);
    worksheet.addRow([
        `Container Code: ${contenedor.codigoReferencia}`,
        `Operator: ${contenedor.nombreOperarioSnapshot}`,
        `Date: ${new Date().toISOString().split('T')[0]}`,
    ]);
    worksheet.addRow([]);
    // Estilo de encabezados de columnas
    const headerRow = worksheet.addRow([
        'Line',
        'Rim (in)',
        'Width (mm)',
        'Profile (%)',
        'Brand',
        'Composite Key',
        'Quantity (PCS)',
    ]);
    headerRow.font = { bold: true };
    // 2. Filas ordenadas por Llanta asc, luego Ancho, luego Perfil
    const sortedItems = [...items].sort((a, b) => {
        if (a.llanta !== b.llanta)
            return a.llanta - b.llanta;
        if (a.ancho !== b.ancho)
            return a.ancho - b.ancho;
        return a.perfil - b.perfil;
    });
    let lineNo = 1;
    let totalCalculado = 0;
    for (const item of sortedItems) {
        totalCalculado += item.cantidad;
        worksheet.addRow([
            lineNo++,
            item.llanta,
            item.ancho,
            item.perfil,
            item.marca || 'GENERICA',
            item.claveCompuesta,
            item.cantidad,
        ]);
    }
    // Fila de Total
    const totalRow = worksheet.addRow([
        'TOTAL',
        '',
        '',
        '',
        '',
        '',
        totalCalculado,
    ]);
    totalRow.font = { bold: true };
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}
async function generateDispatchZip(input) {
    const { contenedor, items, fotos = [] } = input;
    // Generar Excel
    const excelBuffer = await compileOpenXmlManifest(contenedor, items);
    // Empaquetar en ZIP
    const zip = new jszip_1.default();
    const manifestFileName = `manifest_${contenedor.codigoReferencia.replace(/\s+/g, '_')}.xlsx`;
    zip.file(manifestFileName, excelBuffer);
    const fotosFolder = zip.folder('fotos');
    for (const f of fotos) {
        const name = f.evidencia.rutaLocal.split('/').pop() || `${f.evidencia.id}.webp`;
        fotosFolder?.file(name, f.buffer);
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const sha256 = node_crypto_1.default.createHash('sha256').update(zipBuffer).digest('hex');
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
