import { describe, it, expect } from 'vitest';
import {
  createMockSQLiteState,
  inspectSchema,
  queryContainerState,
  verifyVaultIsolation,
  inspectImageMetadata,
  verifyCompressionLimits,
  checkWebpIntegrity,
  parseXlsxStructure,
  auditManifestTotals,
  inspectZipArchive,
  verifyVaultStorage,
  tracePurgeExecution,
  checkFileLocks,
} from '../src/index';
import { ProyectoContenedor } from '@tire-counter/core-contracts';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('MCP Servers Suite (sqlite-inspector, image-qa, openxml-validator, fs-sandbox)', () => {
  describe('1. mcp-sqlite-inspector', () => {
    it('should inspect SQLite DDL schema and return core tables', () => {
      const state = createMockSQLiteState();
      const result = inspectSchema(state);
      expect(result.tables).toContain('operarios');
      expect(result.tables).toContain('contenedores');
      expect(result.tables).toContain('items_neumaticos');
      expect(result.tables).toContain('evidencias_fotos');
    });

    it('should query container state and verify vault isolation', () => {
      const state = createMockSQLiteState();
      const container: ProyectoContenedor = {
        id: 'c-test-01',
        codigoReferencia: 'Contenedor 1001',
        operarioId: 'op-01',
        nombreOperarioSnapshot: 'Test Op',
        estado: 'BLOQUEADO_EN_BOVEDA',
        totalAcumulado: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.containers.set('c-test-01', container);

      const qResult = queryContainerState(state, 'c-test-01');
      expect(qResult.found).toBe(true);

      const isoResult = verifyVaultIsolation(container);
      expect(isoResult.isIsolated).toBe(true);
      expect(isoResult.canMutate).toBe(false);
    });
  });

  describe('2. mcp-image-qa', () => {
    it('should detect valid RIFF/WEBP header and enforce compression limits', () => {
      // Create a mock WebP buffer with RIFF header
      const mockWebp = Buffer.alloc(100);
      mockWebp.write('RIFF', 0);
      mockWebp.write('WEBP', 8);

      const integrity = checkWebpIntegrity(mockWebp);
      expect(integrity.validHeader).toBe(true);

      const meta = inspectImageMetadata(mockWebp, { width: 1280, height: 720 });
      expect(meta.isWebP).toBe(true);
      expect(meta.dimensionMaxPx).toBe(1280);

      const compliance = verifyCompressionLimits(meta);
      expect(compliance.compliant).toBe(true);
    });

    it('should flag violations when image exceeds 1280 px or 150 KB', () => {
      const overLimits = {
        dimensionMaxPx: 1920,
        pesoBytes: 200000,
      };
      const result = verifyCompressionLimits(overLimits);
      expect(result.compliant).toBe(false);
      expect(result.violations.length).toBe(2);
    });
  });

  describe('3. mcp-openxml-validator', () => {
    it('should validate OpenXML structure and audit manifest totals matching SQLite sum', async () => {
      // Build an Excel workbook in memory
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Manifest');
      sheet.addRow(['Tire Packing List', 'Container 203248']);
      sheet.addRow([]);
      sheet.addRow(['Rim', 'Width', 'Profile', 'Brand', 'Quantity']);
      sheet.addRow([16, 205, 55, 'Michelin', 100]);
      sheet.addRow([17, 225, 45, 'Pirelli', 250]);

      const buffer = await workbook.xlsx.writeBuffer();
      const buf = Buffer.from(buffer);

      const parsed = await parseXlsxStructure(buf);
      expect(parsed.valid).toBe(true);
      expect(parsed.sheets).toContain('Manifest');

      const audit = await auditManifestTotals(buf, 350);
      expect(audit.matches).toBe(true);
      expect(audit.excelSum).toBe(350);

      // Package in ZIP
      const zip = new JSZip();
      zip.file('manifest.xlsx', buf);
      zip.file('fotos/evidence1.webp', 'fake-image-bytes');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const zipAudit = await inspectZipArchive(zipBuffer);
      expect(zipAudit.valid).toBe(true);
      expect(zipAudit.hasExcel).toBe(true);
      expect(zipAudit.photoFiles).toContain('fotos/evidence1.webp');
    });
  });

  describe('4. mcp-fs-sandbox', () => {
    it('should inspect vault sandbox directory and trace purge execution', async () => {
      const tmpVault = path.join(os.tmpdir(), `vault-test-${Date.now()}`);
      const vaultCheck = verifyVaultStorage(tmpVault);
      expect(vaultCheck.accessible).toBe(true);

      const testFile = path.join(tmpVault, 'temp-photo.webp');
      fs.writeFileSync(testFile, 'test-photo-data');

      const lockCheck = checkFileLocks([testFile]);
      expect(lockCheck.allUnlocked).toBe(true);

      const purgeTrace = await tracePurgeExecution([testFile], true);
      expect(purgeTrace.purgedCount).toBe(1);
      expect(fs.existsSync(testFile)).toBe(false);

      fs.rmdirSync(tmpVault);
    });
  });
});
