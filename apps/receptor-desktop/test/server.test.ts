import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import cp from 'node:child_process';

const TEST_PORT = 3899;
let serverProc: cp.ChildProcess;

function request(method: string, path: string, body?: any): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // keep string (e.g. html)
          }
          resolve({ status: res.statusCode || 0, data: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

describe('End-to-End HTTP Web Server & Receptor API Suite', () => {
  beforeAll(async () => {
    serverProc = cp.fork('./src/server.js', {
      env: {
        ...process.env,
        PORT: TEST_PORT.toString(),
        SUPABASE_URL: process.env.SUPABASE_URL || 'https://mock.supabase.co',
        SUPABASE_KEY: process.env.SUPABASE_KEY || 'mock-service-key-for-test-suite',
      },
    });
    // Wait for server to bind port by polling
    const start = Date.now();
    let connected = false;
    while (Date.now() - start < 7000) {
      try {
        const ping = await request('GET', '/api/contenedores');
        if (ping.status === 200) {
          connected = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    if (!connected) {
      throw new Error('Test server failed to start on port ' + TEST_PORT);
    }
  });

  afterAll(() => {
    if (serverProc) serverProc.kill();
  });

  it('GET / should serve the Industrial Single Page Application with all 5 languages and touch targets', async () => {
    const res = await request('GET', '/');
    expect(res.status).toBe(200);
    expect(typeof res.data).toBe('string');
    expect(res.data).toContain('Sistema de Conteo y Despacho');
    expect(res.data).toContain('touch-btn');
    expect(res.data).toContain('COUNTER');
  });

  it('GET /api/contenedores should list the active container seeded with tires', async () => {
    const res = await request('GET', '/api/contenedores');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data[0].codigoReferencia).toBe('Contenedor 203248');
  });

  it('POST /api/contenedores/:id/items should aggregate new tires with composite key', async () => {
    const res = await request('POST', '/api/contenedores/550e8400-e29b-41d4-a716-446655440000/items', {
      llanta: 18,
      ancho: 225,
      perfil: 50,
      marca: 'Pirelli',
      deltaCantidad: 8,
    });
    expect(res.status).toBe(200);
    expect(res.data.item.claveCompuesta).toBe('225/50R18--Pirelli');
    expect(res.data.item.cantidad).toBe(8);
  });

  it('POST /api/contenedores/:id/fotos should process raw image into WebP under 150 KB and max 1280 px', async () => {
    const res = await request('POST', '/api/contenedores/550e8400-e29b-41d4-a716-446655440000/fotos', {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.evidencia.formato).toBe('image/webp');
    expect(res.data.evidencia.dimensionMaxPx).toBeLessThanOrEqual(1280);
    expect(res.data.evidencia.pesoBytes).toBeLessThan(153600);
  });

  it('POST /api/contenedores/:id/despachar should lock batch in vault, compile XLSX and ZIP, and transition to DESPACHADO_PENDIENTE_ACK', async () => {
    const res = await request('POST', '/api/contenedores/550e8400-e29b-41d4-a716-446655440000/despachar');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.paquete.sha256).toHaveLength(64);

    // Verify container is locked
    const cRes = await request('GET', '/api/contenedores/550e8400-e29b-41d4-a716-446655440000');
    expect(cRes.data.container.estado).toBe('DESPACHADO_PENDIENTE_ACK');
    expect(cRes.data.container.hashSha256Paquete).toBe(res.data.paquete.sha256);
  });

  it('POST /api/contenedores/:id/items should reject modifications once container is locked (FSM Inmutability)', async () => {
    const res = await request('POST', '/api/contenedores/550e8400-e29b-41d4-a716-446655440000/items', {
      llanta: 16,
      ancho: 205,
      perfil: 55,
      marca: '',
      deltaCantidad: 1,
    });
    expect(res.status).toBe(403);
    expect(res.data.error).toContain('Inmutabilidad de Bóveda activa');
  });

  it('POST /api/contenedores/:id/validar-tic should execute supervisor Tic validation, verify SHA-256 and purge photos into PURGADO', async () => {
    const res = await request('POST', '/api/contenedores/550e8400-e29b-41d4-a716-446655440000/validar-tic');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.ackToken.status).toBe('VERIFIED');
    expect(res.data.purgeResult.purged).toBe(true);

    const cRes = await request('GET', '/api/contenedores/550e8400-e29b-41d4-a716-446655440000');
    expect(cRes.data.container.estado).toBe('PURGADO');
    expect(cRes.data.fotos.length).toBe(0); // Photos purged!
  });

  it('GET /api/mcp/run-all-audits should run all 4 MCP servers and report full compliance', async () => {
    const res = await request('GET', '/api/mcp/run-all-audits');
    expect(res.status).toBe(200);
    expect(res.data.sqlite).toBeDefined();
    expect(res.data.imageQa.compliant).toBe(true);
    expect(res.data.openxml.exactSumMatches).toBe(true);
    expect(res.data.sandbox.vaultIsolated).toBe(true);
  });

  it('POST /api/contenedores should create a new dynamic batch for reception', async () => {
    const res = await request('POST', '/api/contenedores', {
      codigoReferencia: 'Albarán Proveedor Test-99',
      tipoOperacion: 'RECEPCION',
    });
    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
    expect(res.data.codigoReferencia).toBe('Albarán Proveedor Test-99');
    expect(res.data.tipoOperacion).toBe('RECEPCION');
    expect(res.data.estado).toBe('ACTIVO');

    // Add tire items to this reception batch
    const itemRes = await request('POST', `/api/contenedores/${res.data.id}/items`, {
      llanta: 19,
      ancho: 255,
      perfil: 40,
      marca: '',
      deltaCantidad: 12,
    });
    expect(itemRes.status).toBe(200);

    // Confirm reception to ingest into warehouse stock
    const confRes = await request('POST', `/api/contenedores/${res.data.id}/confirmar-recepcion`);
    expect(confRes.status).toBe(200);
    expect(confRes.data.success).toBe(true);
    expect(confRes.data.sumIngresado).toBe(12);

    // Verify stock endpoint reflects the tires
    const stockRes = await request('GET', '/api/stock');
    expect(stockRes.status).toBe(200);
    expect(Array.isArray(stockRes.data)).toBe(true);
    const found = stockRes.data.find((s: any) => s.claveCompuesta === '255/40R19--GENERICA');
    expect(found).toBeDefined();
    expect(found.cantidadTotal).toBe(12);
  });

  it('POST /api/contenedores/reset-demo should reset 550e8400-e29b-41d4-a716-446655440000 back to ACTIVO and unblock testing', async () => {
    const res = await request('POST', '/api/contenedores/reset-demo');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const cRes = await request('GET', '/api/contenedores/550e8400-e29b-41d4-a716-446655440000');
    expect(cRes.status).toBe(200);
    expect(cRes.data.container.estado).toBe('ACTIVO');
    expect(cRes.data.items.length).toBeGreaterThan(0);
  });

  it('GET /manifest.webmanifest should return valid PWA manifest with standalone display and icons', async () => {
    const res = await request('GET', '/manifest.webmanifest');
    expect(res.status).toBe(200);
    expect(res.data.name).toBe('Tire Counter - Control Industrial de Neumáticos');
    expect(res.data.short_name).toBe('TireCounter');
    expect(res.data.display).toBe('standalone');
    expect(Array.isArray(res.data.icons)).toBe(true);
    expect(res.data.icons.length).toBeGreaterThan(0);
  });

  it('GET /sw.js should serve the Industrial Service Worker script', async () => {
    const res = await request('GET', '/sw.js');
    expect(res.status).toBe(200);
    expect(typeof res.data).toBe('string');
    expect(res.data).toContain('CACHE_NAME');
    expect(res.data).toContain('Service Worker');
  });

  it('GET /icon.svg should serve the industrial PWA tire icon', async () => {
    const res = await request('GET', '/icon.svg');
    expect(res.status).toBe(200);
    expect(typeof res.data).toBe('string');
    expect(res.data).toContain('<svg');
    expect(res.data).toContain('circle');
  });
});
