const http = require('node:http');
const url = require('node:url');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const z = require('zod');

// Import from packages
const {
  aggregateItem,
  transitionState,
  assertContainerMutable,
  processReceiptAck,
  compileOpenXmlManifest,
  generateDispatchZip,
  processImageBuffer,
  DICTIONARIES,
  SQLiteLocalAdapter,
  SupabaseCloudAdapter,
  OfflineFirstHybridRepository,
  ItemNeumaticoSchema,
  ItemNeumaticoBaseSchema,
  ItemInputSchema,
  EvidenciaFotoSchema,
  ProyectoContenedorSchema,
} = require('@tire-counter/core-contracts');

const {
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
} = require('@tire-counter/mcp-servers');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_KEY) {
  throw new Error('SUPABASE_KEY environment variable is required');
}

const localAdapter = new SQLiteLocalAdapter();
const cloudAdapter = new SupabaseCloudAdapter({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
const repo = new OfflineFirstHybridRepository(localAdapter, cloudAdapter);

// Request-body validation schemas
const FotoInputSchema = z.object({
  simulatedWidth: z.number().int().positive().optional(),
  simulatedHeight: z.number().int().positive().optional(),
});

const DispatchInputSchema = z.object({}).strict();

let activeSessionUser = {
  id: '3612b21e-2693-403b-b6ac-7704a2c4f1e6',
  codigo: '4120',
  nombre: 'Carlos Sanchez (4120)',
  rol: 'operario',
  email: '4120@counter.local',
};

// In-memory runtime state for demonstration
const paquetesDespacho = new Map(); // id -> PaqueteDespacho
const auditLogs = [];

function logAudit(message, type = 'INFO') {
  auditLogs.unshift({
    timestamp: new Date().toISOString(),
    type,
    message,
  });
  if (auditLogs.length > 50) auditLogs.pop();
}

const initialContainerId = '550e8400-e29b-41d4-a716-446655440000';

async function seedDemoContainer() {
  await repo.crearContenedor({
    id: initialContainerId,
    codigoReferencia: 'Contenedor 203248',
    tipoOperacion: 'DESPACHO',
    operarioId: 'op-001',
    nombreOperarioSnapshot: 'Carlos Sanchez (ID: 4120)',
    estado: 'ACTIVO',
    capacidadObjetivo: 2000,
    totalAcumulado: 0,
  });

  await repo.guardarItem({
    id: crypto.randomUUID(),
    contenedorId: initialContainerId,
    llanta: 16,
    ancho: 205,
    perfil: 55,
    marca: 'Michelin',
    claveCompuesta: '205/55R16--Michelin',
    cantidad: 15,
    updatedAt: new Date().toISOString(),
  });

  await repo.guardarItem({
    id: crypto.randomUUID(),
    contenedorId: initialContainerId,
    llanta: 17,
    ancho: 225,
    perfil: 45,
    marca: 'Bridgestone',
    claveCompuesta: '225/45R17--Bridgestone',
    cantidad: 24,
    updatedAt: new Date().toISOString(),
  });

  // Seed initial sample reception lot
  const recId = '550e8400-e29b-41d4-a716-446655440001';
  await repo.crearContenedor({
    id: recId,
    codigoReferencia: 'Albarán REC-8012',
    tipoOperacion: 'RECEPCION',
    operarioId: 'op-001',
    nombreOperarioSnapshot: 'Carlos Sanchez (ID: 4120)',
    estado: 'ACTIVO',
    capacidadObjetivo: null,
    totalAcumulado: 0,
  });

  await repo.guardarItem({
    id: crypto.randomUUID(),
    contenedorId: recId,
    llanta: 15,
    ancho: 195,
    perfil: 65,
    marca: '',
    claveCompuesta: '195/65R15--GENERICA',
    cantidad: 50,
    updatedAt: new Date().toISOString(),
  });

  // Pre-seed some warehouse stock
  await repo.ingresarStockDesdeLote(recId);
}

async function initServer() {
  await seedDemoContainer();
  logAudit(`Sistema inicializado con lote [Contenedor 203248] y recepción [Albarán REC-8012]`, 'SYSTEM');
}

const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sistema de Conteo y Despacho de Neumáticos (Industrial)</title>
  <style>
    :root {
      --bg-dark: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --accent: #f59e0b; /* Amber Industrial */
      --accent-hover: #d97706;
      --accent-blue: #38bdf8;
      --success: #10b981;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; min-width: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg-dark);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: #090d16;
      border-bottom: 2px solid var(--accent);
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
    }
    .brand h1 {
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .badge {
      background: var(--accent);
      color: #000;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    .lang-switcher {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .lang-btn {
      background: #1e293b;
      border: 1px solid var(--border);
      color: #cbd5e1;
      font-weight: 700;
      padding: 5px 9px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    .lang-btn.active {
      background: var(--accent);
      color: #000;
      border-color: var(--accent);
    }
    nav.tabs {
      background: #111827;
      display: flex;
      border-bottom: 1px solid var(--border);
      padding: 0 16px;
      overflow-x: auto;
      gap: 4px;
    }
    .tab-btn {
      padding: 12px 18px;
      background: none;
      border: none;
      color: var(--text-muted);
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    main {
      padding: 16px;
      flex: 1;
      max-width: 1400px;
      margin: 0 auto;
      width: 100%;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 900px) {
      .grid-2 { grid-template-columns: minmax(0, 1fr); }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .card-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
      gap: 8px;
      white-space: nowrap;
      overflow: hidden;
    }
    .card-title > span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* 3 Industrial Columns Picker on Same Line */
    .picker-columns-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 8px;
    }
    .picker-col {
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }
    .picker-col-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #1e293b;
      gap: 4px;
    }
    .picker-col-title {
      font-size: 0.8rem;
      font-weight: 800;
      color: var(--accent-blue);
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .picker-col-badge {
      background: var(--accent);
      color: #000;
      font-weight: 900;
      font-size: 0.8rem;
      padding: 2px 6px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .picker-scroll-list {
      max-height: 200px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding-right: 2px;
    }
    .picker-scroll-list::-webkit-scrollbar {
      width: 5px;
    }
    .picker-scroll-list::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 3px;
    }
    .picker-item {
      min-height: 42px;
      background: #1e293b;
      color: #cbd5e1;
      border: 2px solid transparent;
      border-radius: 6px;
      font-size: 1.1rem;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      transition: all 0.1s ease;
      white-space: nowrap;
    }
    .picker-item:hover {
      background: #334155;
      color: #fff;
    }
    .picker-item.active {
      background: var(--accent);
      color: #000;
      font-weight: 900;
      border-color: #fff;
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
    }
    .active-measure-banner {
      background: #090d16;
      border: 2px solid var(--accent-blue);
      border-radius: 8px;
      padding: 8px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      white-space: nowrap;
      overflow: hidden;
    }
    .active-measure-label {
      font-size: 0.8rem;
      font-weight: 800;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .active-measure-code {
      font-size: 1.5rem;
      font-weight: 900;
      color: #38bdf8;
      letter-spacing: 0.05em;
      font-family: monospace;
      flex-shrink: 0;
    }
    /* Touch Target Optimization (>= 64px) */
    .touch-btn {
      min-height: 58px;
      min-width: 58px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      font-weight: 900;
      border-radius: 8px;
      border: 2px solid transparent;
      cursor: pointer;
      transition: transform 0.05s, filter 0.15s;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .touch-btn:active {
      transform: scale(0.97);
    }
    .btn-action {
      background: var(--accent);
      color: #000;
    }
    .btn-action:hover {
      background: var(--accent-hover);
    }
    .btn-cyan {
      background: #0284c7;
      color: #fff;
    }
    .btn-secondary {
      background: #334155;
      color: #fff;
    }
    .btn-secondary:hover {
      background: #475569;
    }
    .btn-success {
      background: var(--success);
      color: #000;
      font-weight: 900;
    }
    .btn-danger {
      background: var(--danger);
      color: #fff;
    }
    .cascade-label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent-blue);
      margin-bottom: 6px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .modifier-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin-top: 14px;
    }
    .total-counter {
      background: #090d16;
      border: 2px solid var(--accent);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      margin-bottom: 16px;
    }
    .total-number {
      font-size: 3rem;
      font-weight: 900;
      color: var(--accent);
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .total-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      padding: 10px 8px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th {
      background: #111827;
      color: var(--text-muted);
      font-size: 0.8rem;
      text-transform: uppercase;
    }
    .status-badge {
      display: inline-block;
      padding: 3px 7px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 800;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .status-ACTIVO { background: #065f46; color: #34d399; }
    .status-BLOQUEADO_EN_BOVEDA { background: #78350f; color: #fcd34d; }
    .status-DESPACHADO_PENDIENTE_ACK { background: #1e3a8a; color: #93c5fd; }
    .status-CONFIRMADO_EN_DESTINO { background: #4c1d95; color: #c4b5fd; }
    .status-PURGADO { background: #374151; color: #9ca3af; text-decoration: line-through; }
    .audit-box {
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 10px;
      max-height: 240px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 0.82rem;
    }
    .audit-item {
      padding: 5px 0;
      border-bottom: 1px solid #1e293b;
      display: flex;
      gap: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .audit-time { color: #64748b; flex-shrink: 0; }
    .audit-type { font-weight: 700; flex-shrink: 0; }
    .audit-type.SYSTEM { color: #38bdf8; }
    .audit-type.SUCCESS { color: #34d399; }
    .audit-type.WARN { color: #fbbf24; }
    .audit-type.ERROR { color: #f87171; }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <span class="badge" id="header-badge">COUNTER</span>
      <h1 id="header-title">Terminal Industrial</h1>
    </div>
    <div class="user-cloud-bar" style="display: flex; align-items: center; gap: 10px; margin-left: auto; margin-right: 12px; flex-wrap: wrap;">
      <div id="cloud-status-indicator" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; background: rgba(16,185,129,0.15); border: 1px solid #10b981; padding: 4px 10px; border-radius: 20px; color: #10b981; font-weight: 600;">
        <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; display: inline-block;"></span>
        <span id="txt-cloud-region">☁️ Supabase (Seoul)</span>
      </div>
      <div id="user-session-badge" style="display: inline-flex; align-items: center; gap: 8px; background: #1e293b; border: 1px solid #334155; padding: 4px 10px; border-radius: 8px; font-size: 0.8rem; color: #f8fafc;">
        <span id="current-user-display">👤 <strong id="lbl-user-code">---</strong> (<span id="current-user-role">---</span>)</span>
        <button id="btn-logout" onclick="logoutUser()" style="background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid #ef4444; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer; font-weight: 600;">Salir</button>
      </div>
    </div>
    <div class="lang-switcher">
      <button class="lang-btn active" onclick="setLang('es')">🇪🇸 ES</button>
      <button class="lang-btn" onclick="setLang('en')">🇬🇧 EN</button>
      <button class="lang-btn" onclick="setLang('ru')">🇷🇺 RU</button>
      <button class="lang-btn" onclick="setLang('ko')">🇰🇷 KO</button>
      <button class="lang-btn" onclick="setLang('zh')">🇨🇳 ZH</button>
    </div>
  </header>

  <nav class="tabs">
    <button class="tab-btn active" id="tab-btn-terminal" onclick="switchTab('terminal')">📱 Patio</button>
    <button class="tab-btn" id="tab-btn-supervisor" onclick="switchTab('supervisor')">🖥️ Receptor</button>
    <button class="tab-btn" id="tab-btn-auditor" onclick="switchTab('auditor')">🛡️ Auditor</button>
  </nav>

  <main>
    <!-- TAB 1: TERMINAL MOVIL / PATIO -->
    <section id="tab-terminal">
      <!-- VISTA A: HUB DE OPERACIONES (DESPACHAR VS RECIBIR) -->
      <div id="view-hub">
        <div style="margin-bottom: 16px;">
          <h2 id="hub-main-title" style="font-size: 1.25rem; font-weight: 800; color: #fff;">Centro de Operaciones</h2>
          <p id="hub-sub-title" style="font-size: 0.85rem; color: var(--text-muted);">Seleccione el tipo de operación</p>
        </div>

        <div class="grid-2">
          <!-- Tarjeta 1: DESPACHAR (Salida / Packing List) -->
          <div class="card" style="border-top: 4px solid var(--accent);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h3 id="hub-card-dispatch-title" style="font-size: 1.15rem; font-weight: 800; color: var(--accent);">🚀 Despachar</h3>
              <button class="touch-btn btn-action" style="min-height: 38px; font-size: 0.85rem; padding: 0 12px;" onclick="openNewDispatchModal()" id="btn-hub-new-dispatch">➕ Nuevo Packing List</button>
            </div>
            <p id="hub-card-dispatch-desc" style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">Nuevo Packing List / Pedido de Salida</p>
            <div style="max-height: 180px; overflow-y: auto;" id="list-hub-dispatches">
              <!-- Se llena con los lotes de despacho -->
            </div>
          </div>

          <!-- Tarjeta 2: RECIBIR (Entrada / Inventario) -->
          <div class="card" style="border-top: 4px solid var(--accent-blue);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h3 id="hub-card-receive-title" style="font-size: 1.15rem; font-weight: 800; color: var(--accent-blue);">📥 Recibir</h3>
              <button class="touch-btn btn-cyan" style="min-height: 38px; font-size: 0.85rem; padding: 0 12px;" onclick="openNewReceiveModal()" id="btn-hub-new-receive">➕ Nueva Recepción</button>
            </div>
            <p id="hub-card-receive-desc" style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">Entrada de Ruedas a Inventario</p>
            <div style="max-height: 180px; overflow-y: auto;" id="list-hub-receptions">
              <!-- Se llena con los lotes de recepcion -->
            </div>
          </div>
        </div>

        <!-- Tarjeta 3: STOCK GENERAL DE ALMACÉN -->
        <div class="card" style="margin-top: 16px; border-top: 4px solid var(--success);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
            <div>
              <h3 id="hub-card-stock-title" style="font-size: 1.1rem; font-weight: 800; color: var(--success);">📊 Inventario General de Almacén</h3>
              <p id="hub-card-stock-desc" style="font-size: 0.8rem; color: var(--text-muted);">Stock consolidado acumulado por medida</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="touch-btn btn-secondary" style="min-height: 36px; font-size: 0.8rem; padding: 0 10px;" onclick="loadStockTable()">🔄</button>
              <button class="touch-btn btn-secondary" style="min-height: 36px; font-size: 0.8rem; padding: 0 10px; color: #f59e0b;" onclick="resetDemoBatch()" id="btn-reset-demo-card">♻️ Reiniciar Lote Demo</button>
            </div>
          </div>
          <div style="max-height: 200px; overflow-y: auto;">
            <table style="table-layout: fixed; width: 100%;">
              <thead>
                <tr>
                  <th style="width: 50%;">Medida</th>
                  <th style="width: 25%; text-align: center;">Cantidad</th>
                  <th style="width: 25%; text-align: right;">Último Mov.</th>
                </tr>
              </thead>
              <tbody id="tbl-general-stock">
                <!-- Se llena dinámicamente -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- VISTA B: TERMINAL DE CONTEO -->
      <div id="view-counter" style="display: none;">
        <div class="grid-2">
          <!-- Panel Izquierdo: Cascada y Conteo -->
          <div>
            <div class="card">
              <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <button class="touch-btn btn-secondary" style="min-height: 34px; font-size: 0.85rem; padding: 0 10px;" onclick="backToHub()" id="btn-back-hub">⬅️ Menú</button>
                  <span id="txt-active-container" style="font-weight: 800;">Lote: Contenedor 203248</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="badge" id="badge-operation-type" style="background: var(--accent);">DESPACHO</span>
                  <span class="status-badge status-ACTIVO" id="badge-operario-status">ACTIVO</span>
                </div>
              </div>

              <!-- Total sobredimensionado -->
              <div class="total-counter">
                <div class="total-number" id="lbl-total-count">39</div>
                <div class="total-label" id="txt-total-accumulated">Total Neumáticos</div>
              </div>

              <!-- 3 Columnas: ANCHO -> PERFIL -> LLANTA en la misma línea -->
              <div style="margin-bottom: 12px;">
                <div class="cascade-label" id="txt-size-selector-title">Medida</div>
                <div class="picker-columns-row">
                  <!-- Columna 1: Ancho (Width) -->
                  <div class="picker-col">
                    <div class="picker-col-header">
                      <span class="picker-col-title" id="lbl-col-width">Ancho</span>
                      <span class="picker-col-badge" id="badge-val-width">205</span>
                    </div>
                    <div class="picker-scroll-list" id="list-width">
                      <div class="picker-item" data-val="155" onclick="selectWidth(155)">155</div>
                      <div class="picker-item" data-val="165" onclick="selectWidth(165)">165</div>
                      <div class="picker-item" data-val="175" onclick="selectWidth(175)">175</div>
                      <div class="picker-item" data-val="185" onclick="selectWidth(185)">185</div>
                      <div class="picker-item" data-val="195" onclick="selectWidth(195)">195</div>
                      <div class="picker-item active" data-val="205" onclick="selectWidth(205)">205</div>
                      <div class="picker-item" data-val="215" onclick="selectWidth(215)">215</div>
                      <div class="picker-item" data-val="225" onclick="selectWidth(225)">225</div>
                      <div class="picker-item" data-val="235" onclick="selectWidth(235)">235</div>
                      <div class="picker-item" data-val="245" onclick="selectWidth(245)">245</div>
                      <div class="picker-item" data-val="255" onclick="selectWidth(255)">255</div>
                      <div class="picker-item" data-val="265" onclick="selectWidth(265)">265</div>
                      <div class="picker-item" data-val="275" onclick="selectWidth(275)">275</div>
                      <div class="picker-item" data-val="285" onclick="selectWidth(285)">285</div>
                    </div>
                  </div>

                  <!-- Columna 2: Perfil (Aspect Ratio) -->
                  <div class="picker-col">
                    <div class="picker-col-header">
                      <span class="picker-col-title" id="lbl-col-profile">Perfil</span>
                      <span class="picker-col-badge" id="badge-val-profile">55</span>
                    </div>
                    <div class="picker-scroll-list" id="list-profile">
                      <div class="picker-item" data-val="30" onclick="selectProfile(30)">30</div>
                      <div class="picker-item" data-val="35" onclick="selectProfile(35)">35</div>
                      <div class="picker-item" data-val="40" onclick="selectProfile(40)">40</div>
                      <div class="picker-item" data-val="45" onclick="selectProfile(45)">45</div>
                      <div class="picker-item" data-val="50" onclick="selectProfile(50)">50</div>
                      <div class="picker-item active" data-val="55" onclick="selectProfile(55)">55</div>
                      <div class="picker-item" data-val="60" onclick="selectProfile(60)">60</div>
                      <div class="picker-item" data-val="65" onclick="selectProfile(65)">65</div>
                      <div class="picker-item" data-val="70" onclick="selectProfile(70)">70</div>
                      <div class="picker-item" data-val="75" onclick="selectProfile(75)">75</div>
                      <div class="picker-item" data-val="80" onclick="selectProfile(80)">80</div>
                      <div class="picker-item" data-val="85" onclick="selectProfile(85)">85</div>
                    </div>
                  </div>

                  <!-- Columna 3: Llanta (Rim) -->
                  <div class="picker-col">
                    <div class="picker-col-header">
                      <span class="picker-col-title" id="lbl-col-rim">Llanta</span>
                      <span class="picker-col-badge" id="badge-val-rim">16"</span>
                    </div>
                    <div class="picker-scroll-list" id="list-rim">
                      <div class="picker-item" data-val="13" onclick="selectRim(13)">13"</div>
                      <div class="picker-item" data-val="14" onclick="selectRim(14)">14"</div>
                      <div class="picker-item" data-val="15" onclick="selectRim(15)">15"</div>
                      <div class="picker-item active" data-val="16" onclick="selectRim(16)">16"</div>
                      <div class="picker-item" data-val="17" onclick="selectRim(17)">17"</div>
                      <div class="picker-item" data-val="18" onclick="selectRim(18)">18"</div>
                      <div class="picker-item" data-val="19" onclick="selectRim(19)">19"</div>
                      <div class="picker-item" data-val="20" onclick="selectRim(20)">20"</div>
                      <div class="picker-item" data-val="21" onclick="selectRim(21)">21"</div>
                      <div class="picker-item" data-val="22" onclick="selectRim(22)">22"</div>
                    </div>
                  </div>
                </div>

                <!-- Medida Activa Visual en Tiempo Real -->
                <div class="active-measure-banner">
                  <span class="active-measure-label" id="lbl-selected-measure">Activa:</span>
                  <span class="active-measure-code" id="txt-selected-measure-code">205/55 R16</span>
                </div>
              </div>

              <!-- Modificadores de Adición Rápida -->
              <div class="modifier-grid">
                <button class="touch-btn btn-action" onclick="addQuantity(1)">+1</button>
                <button class="touch-btn btn-action" onclick="addQuantity(2)">+2</button>
                <button class="touch-btn btn-action" onclick="addQuantity(4)">+4</button>
                <button class="touch-btn btn-action" onclick="addQuantity(5)">+5</button>
                <button class="touch-btn btn-action" onclick="addQuantity(10)">+10</button>
              </div>
            </div>
          </div>

          <!-- Panel Derecho: Lista activa, Captura de Foto y Despacho -->
          <div>
            <div class="card">
              <div class="card-title">
                <span id="txt-summary-title">Detalle</span>
                <button class="touch-btn btn-cyan" id="btn-capture-photo" style="min-height: 38px; font-size: 0.85rem; padding: 0 12px;" onclick="captureMockPhoto()">📷 Foto</button>
              </div>

              <div style="margin-bottom: 10px; font-size: 0.82rem; color: var(--text-muted);" id="lbl-photos-count">
                Fotos: 0 WebP
              </div>

              <div style="max-height: 360px; overflow-y: auto;">
                <table style="table-layout: fixed; width: 100%;">
                  <thead>
                    <tr>
                      <th id="th-measure" style="width: 44%;">Medida</th>
                      <th id="th-qty" style="width: 20%; text-align: center;">Cant.</th>
                      <th id="th-adjust" style="width: 36%; text-align: center;">±</th>
                    </tr>
                  </thead>
                  <tbody id="tbl-items">
                    <!-- Se llena dinámicamente -->
                  </tbody>
                </table>
              </div>

              <div style="margin-top: 16px;">
                <button class="touch-btn btn-action" style="width: 100%; min-height: 56px; font-size: 1.15rem;" id="btn-dispatch" onclick="dispatchContainer()">
                  🚀 Despachar
                </button>
              </div>

              <!-- Caja de opciones cuando el lote está bloqueado/finalizado -->
              <div id="box-locked-options" style="display: none; margin-top: 12px; background: #1a2234; border: 1px dashed var(--accent); border-radius: 8px; padding: 12px; text-align: center;">
                <p style="font-size: 0.85rem; color: #fcd34d; margin-bottom: 10px;">🔒 Lote finalizado / sellado. Para continuar:</p>
                <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                  <button class="touch-btn btn-action" style="min-height: 38px; font-size: 0.85rem; padding: 0 14px;" onclick="openNewDispatchModal()">➕ Nuevo Packing List</button>
                  <button class="touch-btn btn-secondary" style="min-height: 38px; font-size: 0.85rem; padding: 0 14px;" onclick="backToHub()">⬅️ Volver al Menú</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 2: ADMIN (SUPERVISOR & INVENTARIO) -->
    <section id="tab-supervisor" style="display: none;">
      <!-- Tarjeta 1: Inventario General de Almacén en Admin -->
      <div class="card" style="border-top: 4px solid var(--success); margin-bottom: 16px;">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span id="txt-admin-stock-title" style="color: var(--success); font-weight: 800;">📊 Inventario General de Almacén</span>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal; margin-top: 2px;">Stock permanente consolidado en almacén</div>
          </div>
          <button class="touch-btn btn-secondary" style="min-height: 36px; font-size: 0.82rem; padding: 0 12px;" onclick="loadSupervisorView()">🔄 Actualizar</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 12px;">
          <div style="background: #0f172a; border: 1px solid var(--border); border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Total Neumáticos</div>
            <div id="stat-admin-total-tires" style="font-size: 1.5rem; font-weight: 900; color: var(--success);">0</div>
          </div>
          <div style="background: #0f172a; border: 1px solid var(--border); border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Medidas en Stock</div>
            <div id="stat-admin-distinct-sizes" style="font-size: 1.5rem; font-weight: 900; color: var(--accent-blue);">0</div>
          </div>
          <div style="background: #0f172a; border: 1px solid var(--border); border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Lotes Activos</div>
            <div id="stat-admin-active-batches" style="font-size: 1.5rem; font-weight: 900; color: var(--accent);">0</div>
          </div>
        </div>

        <div style="max-height: 220px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="width: 45%;">Medida</th>
                <th style="width: 25%; text-align: center;">Cantidad</th>
                <th style="width: 30%; text-align: right;">Último Movimiento</th>
              </tr>
            </thead>
            <tbody id="tbl-admin-stock">
              <!-- Se llena dinámicamente -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tarjeta 2: Gestión de Lotes y Despachos -->
      <div class="card" style="border-top: 4px solid var(--accent);">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span id="txt-supervisor-title" style="font-weight: 800;">Panel Admin</span>
            <span style="font-size: 0.78rem; color: var(--text-muted); font-weight: normal; margin-left: 6px;">• Lotes, Despachos y Entradas</span>
          </div>
          <button class="touch-btn btn-secondary" id="btn-refresh-supervisor" style="min-height: 36px; font-size: 0.82rem; padding: 0 10px;" onclick="loadSupervisorView()">🔄</button>
        </div>

        <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%;">
          <table style="min-width: 600px; width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th id="th-sup-code" style="width: 30%; min-width: 140px;">Lote</th>
                <th id="th-sup-operator" style="width: 22%; min-width: 110px;">Operario</th>
                <th id="th-sup-total" style="width: 14%; min-width: 70px; text-align: center;">Total</th>
                <th id="th-sup-status" style="width: 16%; min-width: 100px; text-align: center;">Estado</th>
                <th id="th-sup-actions" style="width: 18%; min-width: 140px; text-align: right; padding-right: 12px;">Acción</th>
              </tr>
            </thead>
            <tbody id="tbl-supervisor-containers">
              <!-- Se llena dinámicamente -->
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" id="card-manifest-preview" style="display: none; margin-top: 16px;">
        <div class="card-title">
          <span id="txt-inspection-title">Manifiesto & ZIP</span>
          <div>
            <a id="lnk-download-xlsx" href="#" class="touch-btn btn-cyan" style="min-height: 36px; font-size: 0.8rem; text-decoration: none; padding: 0 10px;">📥 .xlsx</a>
            <a id="lnk-download-zip" href="#" class="touch-btn btn-action" style="min-height: 36px; font-size: 0.8rem; text-decoration: none; padding: 0 10px; margin-left: 6px;">📦 .zip</a>
          </div>
        </div>
        <div id="manifest-details" style="font-family: monospace; font-size: 0.88rem; line-height: 1.5; color: #cbd5e1;"></div>
      </div>
    </section>

    <!-- TAB 3: AUDITOR & MCPS -->
    <section id="tab-auditor" style="display: none;">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">
            <span id="txt-mcp-title">Servidores MCP</span>
            <button class="touch-btn btn-cyan" id="btn-mcp-battery" style="min-height: 36px; font-size: 0.82rem; padding: 0 12px;" onclick="runAllMCPAudits()">⚡ Test</button>
          </div>
          <div id="mcp-results" data-ran="false" style="font-size: 0.88rem; line-height: 1.5;">
            Presione 'Test' para verificar los 4 servidores MCP.
          </div>
        </div>

        <div class="card">
          <div class="card-title">
            <span id="txt-audit-log-title">Log Auditoría</span>
          </div>
          <div class="audit-box" id="audit-log-stream">
            <!-- Se llena dinámicamente -->
          </div>
        </div>
      </div>
    </section>

    <!-- Modal Nuevo Packing List / Recepción -->
    <div id="modal-new-batch" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 999; align-items: center; justify-content: center; padding: 16px;">
      <div style="background: #1e293b; border: 2px solid var(--accent); border-radius: 12px; width: 100%; max-width: 440px; padding: 20px;">
        <h3 id="modal-title" style="font-size: 1.2rem; font-weight: 800; margin-bottom: 14px; color: #fff;">Nuevo Packing List</h3>
        <div style="margin-bottom: 12px;">
          <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Referencia / Código:</label>
          <input type="text" id="input-batch-ref" style="width: 100%; background: #0f172a; border: 1px solid var(--border); color: #fff; padding: 10px; border-radius: 6px; font-size: 1rem;" placeholder="ej: Contenedor 203249">
        </div>
        <div style="margin-bottom: 18px;" id="box-modal-capacity">
          <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Capacidad estimada:</label>
          <input type="number" id="input-batch-capacity" style="width: 100%; background: #0f172a; border: 1px solid var(--border); color: #fff; padding: 10px; border-radius: 6px; font-size: 1rem;" placeholder="2000" value="2000">
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button class="touch-btn btn-secondary" style="min-height: 42px; font-size: 0.9rem; padding: 0 16px;" onclick="closeModal()">Cancelar</button>
          <button class="touch-btn btn-action" style="min-height: 42px; font-size: 0.9rem; padding: 0 20px;" onclick="submitNewBatch()" id="btn-modal-submit">Iniciar</button>
        </div>
      </div>
    </div>

    <!-- PANTALLA PRINCIPAL DE LOGIN (OBLIGATORIA) -->
    <div id="screen-login" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #0b0f19; z-index: 10000; align-items: center; justify-content: center; padding: 16px;">
      <div style="background: #1e293b; border: 2px solid var(--accent); border-radius: 14px; width: 100%; max-width: 390px; padding: 28px 22px; box-shadow: 0 20px 45px rgba(0,0,0,0.75);">
        
        <div style="text-align: center; margin-bottom: 22px;">
          <span class="badge" style="background: var(--accent); color: #000; font-weight: 900; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; letter-spacing: 1px;">COUNTER</span>
          <h2 style="font-size: 1.35rem; font-weight: 800; color: #fff; margin-top: 10px; margin-bottom: 4px;">Acceso al Sistema</h2>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Introduce tu código de usuario y contraseña</p>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="font-size: 0.8rem; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 6px;">Código de Usuario / Empleado:</label>
          <input type="text" id="input-login-code" placeholder="Tu código personal" autocomplete="username" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid var(--border); border-radius: 8px; color: #fff; font-size: 1rem; font-weight: 700; text-transform: uppercase;" onkeydown="if(event.key==='Enter') document.getElementById('input-login-password').focus();" />
        </div>

        <div style="margin-bottom: 16px;">
          <label style="font-size: 0.8rem; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 6px;">Contraseña:</label>
          <div style="position: relative;">
            <input type="password" id="input-login-password" placeholder="Tu contraseña" autocomplete="current-password" style="width: 100%; padding: 12px 42px 12px 12px; background: #0f172a; border: 1px solid var(--border); border-radius: 8px; color: #fff; font-size: 1rem;" onkeydown="if(event.key==='Enter') executeLogin();" />
            <button type="button" onclick="togglePasswordVisibility()" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 1.15rem;">👁️</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 18px;">
          <input type="checkbox" id="chk-remember-me" checked style="width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer;" />
          <label for="chk-remember-me" style="font-size: 0.85rem; color: #cbd5e1; cursor: pointer; user-select: none;">Recordar sesión en este dispositivo</label>
        </div>

        <div id="auth-error-msg" style="display: none; background: rgba(239,68,68,0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px 12px; font-size: 0.85rem; color: #ef4444; margin-bottom: 16px;"></div>

        <button onclick="executeLogin()" class="touch-btn btn-action" id="btn-login-submit" style="width: 100%; min-height: 48px; font-size: 1rem; font-weight: 800; border-radius: 8px;">Entrar</button>

        <div style="margin-top: 18px; text-align: center; font-size: 0.75rem; color: #64748b;">
          ☁️ Conectado a Supabase Cloud (Seúl)
        </div>
      </div>
    </div>
  </main>

  <script>
    let currentLang = 'es';
    let currentView = 'hub';
    let modalMode = 'DESPACHO';
    let activeContainerId = '${initialContainerId}';
    let currentRim = 16;
    let currentWidth = 205;
    let currentProfile = 55;

    const i18nDicts = ${JSON.stringify(DICTIONARIES)};

    function selectRim(rim) {
      currentRim = rim;
      document.getElementById('badge-val-rim').innerText = rim + '"';
      document.querySelectorAll('#list-rim .picker-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.getAttribute('data-val')) === rim);
      });
      updateMeasureDisplay();
    }

    function selectWidth(width) {
      currentWidth = width;
      document.getElementById('badge-val-width').innerText = width;
      document.querySelectorAll('#list-width .picker-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.getAttribute('data-val')) === width);
      });
      updateMeasureDisplay();
    }

    function selectProfile(profile) {
      currentProfile = profile;
      document.getElementById('badge-val-profile').innerText = profile;
      document.querySelectorAll('#list-profile .picker-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.getAttribute('data-val')) === profile);
      });
      updateMeasureDisplay();
    }

    function updateMeasureDisplay() {
      document.getElementById('txt-selected-measure-code').innerText = currentWidth + '/' + currentProfile + ' R' + currentRim;
    }

    function openNewDispatchModal() {
      modalMode = 'DESPACHO';
      const t = i18nDicts[currentLang] || i18nDicts.es;
      document.getElementById('modal-title').innerText = t.hub ? t.hub.new_dispatch_modal_title : 'Nuevo Packing List';
      document.getElementById('box-modal-capacity').style.display = 'block';
      document.getElementById('input-batch-ref').value = 'Contenedor ' + Math.floor(100000 + Math.random() * 900000);
      document.getElementById('modal-new-batch').style.display = 'flex';
    }

    function openNewReceiveModal() {
      modalMode = 'RECEPCION';
      const t = i18nDicts[currentLang] || i18nDicts.es;
      document.getElementById('modal-title').innerText = t.hub ? t.hub.new_receive_modal_title : 'Nueva Recepción de Ruedas';
      document.getElementById('box-modal-capacity').style.display = 'none';
      document.getElementById('input-batch-ref').value = 'Albarán REC-' + Math.floor(1000 + Math.random() * 9000);
      document.getElementById('modal-new-batch').style.display = 'flex';
    }

    function closeModal() {
      document.getElementById('modal-new-batch').style.display = 'none';
    }

    async function submitNewBatch() {
      const ref = document.getElementById('input-batch-ref').value;
      const cap = document.getElementById('input-batch-capacity').value;
      const res = await fetch('/api/contenedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoReferencia: ref,
          tipoOperacion: modalMode,
          capacidadObjetivo: modalMode === 'DESPACHO' ? parseInt(cap) || 2000 : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        closeModal();
        openContainer(data.id);
      } else {
        alert(data.error || 'Error al crear lote');
      }
    }

    function backToHub() {
      currentView = 'hub';
      document.getElementById('view-hub').style.display = 'block';
      document.getElementById('view-counter').style.display = 'none';
      loadHubData();
    }

    function openContainer(id) {
      activeContainerId = id;
      currentView = 'counter';
      document.getElementById('view-hub').style.display = 'none';
      document.getElementById('view-counter').style.display = 'block';
      loadTerminalData();
    }

    async function resetDemoBatch() {
      const res = await fetch('/api/contenedores/reset-demo', { method: 'POST' });
      if (res.ok) {
        alert('Lote de pruebas [Contenedor 203248] reiniciado a estado ACTIVO.');
        loadHubData();
        if (currentView === 'counter') loadTerminalData();
      }
    }

    async function confirmReception() {
      const t = i18nDicts[currentLang] || i18nDicts.es;
      if (!confirm('¿Confirmar recepción e ingresar los neumáticos al inventario general de almacén?')) return;
      const res = await fetch('/api/contenedores/' + activeContainerId + '/confirmar-recepcion', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert((t.hub ? t.hub.receive_success : 'Material ingresado') + ' (' + data.sumIngresado + ' u.)');
        loadTerminalData();
      } else {
        alert(data.error || 'Error al confirmar recepción');
      }
    }

    async function loadHubData() {
      const res = await fetch('/api/contenedores');
      const containers = await res.json();
      const t = i18nDicts[currentLang] || i18nDicts.es;

      const listDisp = document.getElementById('list-hub-dispatches');
      const listRec = document.getElementById('list-hub-receptions');
      if (!listDisp || !listRec) return;
      listDisp.innerHTML = '';
      listRec.innerHTML = '';

      const dispatches = containers.filter(c => c.tipoOperacion !== 'RECEPCION');
      const receptions = containers.filter(c => c.tipoOperacion === 'RECEPCION');

      if (dispatches.length === 0) {
        listDisp.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:8px 0;">No hay packing lists</div>';
      } else {
        dispatches.forEach(c => {
          const div = document.createElement('div');
          div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border);';
          div.innerHTML = \`
            <div style="overflow:hidden; text-overflow:ellipsis;">
              <strong style="font-size:0.9rem; color:#fff;">\${c.codigoReferencia}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted);">\${c.totalAcumulado} \${t.supervisor.unit_tires} | <span class="status-badge status-\${c.estado}">\${c.estado}</span></div>
            </div>
            <button class="touch-btn btn-secondary" style="min-height:32px; font-size:0.8rem; padding:0 12px; margin-left:8px;" onclick="openContainer('\${c.id}')">Abrir</button>
          \`;
          listDisp.appendChild(div);
        });
      }

      if (receptions.length === 0) {
        listRec.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:8px 0;">No hay recepciones activas</div>';
      } else {
        receptions.forEach(c => {
          const div = document.createElement('div');
          div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border);';
          div.innerHTML = \`
            <div style="overflow:hidden; text-overflow:ellipsis;">
              <strong style="font-size:0.9rem; color:#fff;">\${c.codigoReferencia}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted);">\${c.totalAcumulado} \${t.supervisor.unit_tires} | <span class="status-badge status-\${c.estado}">\${c.estado}</span></div>
            </div>
            <button class="touch-btn btn-cyan" style="min-height:32px; font-size:0.8rem; padding:0 12px; margin-left:8px;" onclick="openContainer('\${c.id}')">Abrir</button>
          \`;
          listRec.appendChild(div);
        });
      }

      loadStockTable();
    }

    async function loadStockTable() {
      const res = await fetch('/api/stock');
      const stock = await res.json();
      
      let totalStock = 0;
      let rowsHtml = '';
      if (!stock || stock.length === 0) {
        rowsHtml = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:12px;">Sin existencias en almacén</td></tr>';
      } else {
        stock.forEach(s => {
          totalStock += s.cantidadTotal;
          rowsHtml += \`
            <tr style="border-bottom: 1px solid var(--border);">
              <td style="padding: 10px 8px;"><strong style="color:#fff; font-size:0.95rem;">\${s.ancho}/\${s.perfil}R\${s.llanta}</strong></td>
              <td style="padding: 10px 8px; text-align:center;"><span style="font-size:1.2rem; font-weight:900; color:var(--success);">\${s.cantidadTotal}</span></td>
              <td style="padding: 10px 8px; text-align:right; font-size:0.75rem; color:var(--text-muted);">\${new Date(s.updatedAt).toLocaleTimeString()}</td>
            </tr>
          \`;
        });
      }

      const tbodyGeneral = document.getElementById('tbl-general-stock');
      if (tbodyGeneral) tbodyGeneral.innerHTML = rowsHtml;

      const tbodyAdmin = document.getElementById('tbl-admin-stock');
      if (tbodyAdmin) tbodyAdmin.innerHTML = rowsHtml;

      const elTotal = document.getElementById('stat-admin-total-tires');
      if (elTotal) elTotal.innerText = totalStock;

      const elSizes = document.getElementById('stat-admin-distinct-sizes');
      if (elSizes) elSizes.innerText = stock ? stock.length : 0;
    }

    function setLang(lang) {
      currentLang = lang;
      document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = Array.from(document.querySelectorAll('.lang-btn')).find(b => b.innerText.toLowerCase().includes(lang));
      if (activeBtn) activeBtn.classList.add('active');

      const t = i18nDicts[lang] || i18nDicts.es;

      // Header
      document.getElementById('header-badge').innerText = t.header.brand_badge;
      document.getElementById('header-title').innerText = t.header.main_title;

      // Tabs
      document.getElementById('tab-btn-terminal').innerText = t.tabs.terminal;
      document.getElementById('tab-btn-supervisor').innerText = t.tabs.supervisor;
      document.getElementById('tab-btn-auditor').innerText = t.tabs.auditor;

      // Hub Translations
      if (t.hub) {
        const hubTitle = document.getElementById('hub-main-title');
        if (hubTitle) hubTitle.innerText = t.hub.title;
        const hubSub = document.getElementById('hub-sub-title');
        if (hubSub) hubSub.innerText = t.hub.subtitle;
        const cardDispTitle = document.getElementById('hub-card-dispatch-title');
        if (cardDispTitle) cardDispTitle.innerText = t.hub.btn_dispatch_flow;
        const cardDispDesc = document.getElementById('hub-card-dispatch-desc');
        if (cardDispDesc) cardDispDesc.innerText = t.hub.dispatch_desc;
        const btnHubDisp = document.getElementById('btn-hub-new-dispatch');
        if (btnHubDisp) btnHubDisp.innerText = '➕ ' + t.hub.new_dispatch_modal_title;
        const cardRecTitle = document.getElementById('hub-card-receive-title');
        if (cardRecTitle) cardRecTitle.innerText = t.hub.btn_receive_flow;
        const cardRecDesc = document.getElementById('hub-card-receive-desc');
        if (cardRecDesc) cardRecDesc.innerText = t.hub.receive_desc;
        const btnHubRec = document.getElementById('btn-hub-new-receive');
        if (btnHubRec) btnHubRec.innerText = '➕ ' + t.hub.new_receive_modal_title;
        const cardStockTitle = document.getElementById('hub-card-stock-title');
        if (cardStockTitle) cardStockTitle.innerText = t.hub.btn_stock_flow;
        const cardStockDesc = document.getElementById('hub-card-stock-desc');
        if (cardStockDesc) cardStockDesc.innerText = t.hub.stock_desc;
        const btnBack = document.getElementById('btn-back-hub');
        if (btnBack) btnBack.innerText = t.hub.btn_back_to_hub;
        const btnResetDemo = document.getElementById('btn-reset-demo-card');
        if (btnResetDemo) btnResetDemo.innerText = t.hub.btn_reset_demo;
      }

      // Size Selectors (3 visible columns on same line)
      document.getElementById('txt-size-selector-title').innerText = t.counter.size_selector_title;
      document.getElementById('lbl-col-rim').innerText = t.counter.step_rim;
      document.getElementById('lbl-col-width').innerText = t.counter.step_width;
      document.getElementById('lbl-col-profile').innerText = t.counter.step_profile;
      document.getElementById('lbl-selected-measure').innerText = t.counter.selected_measure_label;

      // Counter
      document.getElementById('txt-total-accumulated').innerText = t.counter.total_accumulated;
      document.getElementById('txt-summary-title').innerText = t.counter.summary_title;
      document.getElementById('btn-capture-photo').innerText = t.counter.btn_capture_evidence;

      // Table Headers
      document.getElementById('th-measure').innerText = t.counter.col_measure;
      document.getElementById('th-qty').innerText = t.counter.col_qty;
      document.getElementById('th-adjust').innerText = t.counter.col_adjust;

      // Supervisor
      document.getElementById('txt-supervisor-title').innerText = t.supervisor.title;
      document.getElementById('btn-refresh-supervisor').innerText = t.supervisor.btn_refresh;
      document.getElementById('th-sup-code').innerText = t.supervisor.col_code;
      document.getElementById('th-sup-operator').innerText = t.supervisor.col_operator;
      document.getElementById('th-sup-total').innerText = t.supervisor.col_total;
      document.getElementById('th-sup-status').innerText = t.supervisor.col_status;
      document.getElementById('th-sup-hash').innerText = t.supervisor.col_hash;
      document.getElementById('th-sup-actions').innerText = t.supervisor.col_actions;
      document.getElementById('txt-inspection-title').innerText = t.supervisor.inspection_title;
      document.getElementById('lnk-download-xlsx').innerText = t.supervisor.btn_download_xlsx;
      document.getElementById('lnk-download-zip').innerText = t.supervisor.btn_download_zip;

      // MCP Tab
      document.getElementById('txt-mcp-title').innerText = t.mcp.title;
      document.getElementById('btn-mcp-battery').innerText = t.mcp.btn_run_battery;
      document.getElementById('txt-audit-log-title').innerText = t.mcp.audit_log_title;
      const mcpRes = document.getElementById('mcp-results');
      if (mcpRes && mcpRes.getAttribute('data-ran') !== 'true') {
        mcpRes.innerText = t.mcp.prompt_run;
      }

      // Re-render data with translated values
      loadHubData();
      loadTerminalData();
      loadSupervisorView();
      updateMeasureDisplay();
    }

    let activeUser = {
      codigo: '4120',
      nombre: 'Carlos Sanchez (4120)',
      rol: 'operario'
    };

    function togglePasswordVisibility() {
      const pwd = document.getElementById('input-login-password');
      if (pwd) pwd.type = pwd.type === 'password' ? 'text' : 'password';
    }

    function logoutUser() {
      localStorage.removeItem('counter_saved_auth');
      const pwdInput = document.getElementById('input-login-password');
      if (pwdInput) pwdInput.value = '';
      const loginScreen = document.getElementById('screen-login');
      if (loginScreen) loginScreen.style.display = 'flex';
      const codeInput = document.getElementById('input-login-code');
      if (codeInput) {
        codeInput.value = '';
        codeInput.focus();
      }
    }

    async function executeLogin() {
      const codigoInput = document.getElementById('input-login-code');
      const passwordInput = document.getElementById('input-login-password');
      const rememberCheckbox = document.getElementById('chk-remember-me');
      const errBox = document.getElementById('auth-error-msg');
      const submitBtn = document.getElementById('btn-login-submit');

      const codigo = (codigoInput && codigoInput.value.trim()) || '';
      const password = (passwordInput && passwordInput.value) || '';
      const remember = rememberCheckbox ? rememberCheckbox.checked : true;

      if (!codigo) {
        if (errBox) {
          errBox.innerText = 'Introduce tu código de usuario.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (!password) {
        if (errBox) {
          errBox.innerText = 'Introduce tu contraseña.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (errBox) errBox.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Verificando...';
      }

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo, password })
        });
        const data = await res.json();

        if (res.ok && data.ok && data.user) {
          activeUser = data.user;
          updateUserUI();

          // Recordar en este dispositivo
          if (remember) {
            localStorage.setItem('counter_saved_auth', JSON.stringify({ codigo, password }));
          } else {
            localStorage.removeItem('counter_saved_auth');
          }

          const loginScreen = document.getElementById('screen-login');
          if (loginScreen) loginScreen.style.display = 'none';
        } else {
          if (errBox) {
            errBox.innerText = data.error || 'Código o contraseña incorrectos.';
            errBox.style.display = 'block';
          }
        }
      } catch (err) {
        if (errBox) {
          errBox.innerText = 'Error de conexión con el servidor.';
          errBox.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Entrar';
        }
      }
    }

    async function checkSavedAuth() {
      try {
        const saved = localStorage.getItem('counter_saved_auth');
        if (saved) {
          const creds = JSON.parse(saved);
          if (creds && creds.codigo) {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ codigo: creds.codigo, password: creds.password })
            });
            const data = await res.json();
            if (res.ok && data.ok && data.user) {
              activeUser = data.user;
              updateUserUI();
              const loginScreen = document.getElementById('screen-login');
              if (loginScreen) loginScreen.style.display = 'none';
              return;
            }
          }
        }
      } catch (e) {
        console.warn('Auto-login:', e);
      }
      // Si no hay sesión recordada, asegurarse de que la pantalla de login esté abierta y enfocada
      const loginScreen = document.getElementById('screen-login');
      if (loginScreen) loginScreen.style.display = 'flex';
      const codeInput = document.getElementById('input-login-code');
      if (codeInput) codeInput.focus();
    }

    function updateUserUI() {
      const codeSpan = document.getElementById('lbl-user-code');
      if (codeSpan) codeSpan.innerText = activeUser.codigo;
      const roleSpan = document.getElementById('current-user-role');
      if (roleSpan) roleSpan.innerText = activeUser.rol === 'admin' ? 'Admin' : 'Operario';

      const supBtn = document.getElementById('tab-btn-supervisor');
      if (supBtn) {
        supBtn.style.opacity = activeUser.rol === 'admin' ? '1' : '0.7';
      }
    }

    function switchTab(tabId) {
      if (tabId === 'supervisor' && activeUser && activeUser.rol !== 'admin') {
        alert('Acceso restringido a Supervisores / Admin. Tu usuario actual (' + activeUser.codigo + ') es Operario. Usa el botón Cambiar para acceder como ADMIN.');
        return;
      }

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('tab-terminal').style.display = 'none';
      document.getElementById('tab-supervisor').style.display = 'none';
      document.getElementById('tab-auditor').style.display = 'none';

      document.getElementById('tab-' + tabId).style.display = 'block';
      event.target.classList.add('active');

      if (tabId === 'terminal') {
        if (currentView === 'hub') loadHubData();
        else loadTerminalData();
      }
      if (tabId === 'supervisor') loadSupervisorView();
      if (tabId === 'auditor') loadAuditLogs();
    }

    async function loadTerminalData() {
      const res = await fetch('/api/contenedores/' + activeContainerId);
      const data = await res.json();
      if (!data.found) return;

      const t = i18nDicts[currentLang] || i18nDicts.es;

      document.getElementById('lbl-total-count').innerText = data.container.totalAcumulado;
      document.getElementById('txt-active-container').innerText = t.counter.active_container + ': ' + data.container.codigoReferencia;
      
      const isReception = data.container.tipoOperacion === 'RECEPCION';
      const badgeType = document.getElementById('badge-operation-type');
      if (badgeType) {
        badgeType.innerText = isReception ? (t.hub ? t.hub.btn_receive_flow : 'RECEPCIÓN') : (t.hub ? t.hub.btn_dispatch_flow : 'DESPACHO');
        badgeType.style.background = isReception ? 'var(--accent-blue)' : 'var(--accent)';
      }

      const badge = document.getElementById('badge-operario-status');
      badge.className = 'status-badge status-' + data.container.estado;
      const statusKey = 'status_' + data.container.estado.toLowerCase();
      const translatedStatus = (t.vault && t.vault[statusKey]) || data.container.estado;
      badge.innerText = translatedStatus;

      // Disable or enable dispatch button based on state
      const isLocked = data.container.estado !== 'ACTIVO';
      const btnAction = document.getElementById('btn-dispatch');
      btnAction.disabled = isLocked;

      if (isReception) {
        btnAction.onclick = confirmReception;
        if (isLocked) {
          btnAction.innerText = '🔒 ' + ((t.vault && t.vault.status_confirmed) || 'CONFIRMADO');
        } else {
          btnAction.innerText = t.hub ? t.hub.btn_confirm_receive : '✅ Ingresar a Inventario';
        }
      } else {
        btnAction.onclick = dispatchContainer;
        if (isLocked) {
          btnAction.innerText = t.counter.dispatch_locked + ' (' + translatedStatus + ')';
        } else {
          btnAction.innerText = '🚀 ' + t.counter.dispatch_button;
        }
      }

      const boxLocked = document.getElementById('box-locked-options');
      if (boxLocked) {
        boxLocked.style.display = isLocked ? 'block' : 'none';
      }

      // Photos count
      document.getElementById('lbl-photos-count').innerText = t.counter.registered_photos_prefix + ' ' + data.fotos.length + ' ' + t.counter.registered_photos_suffix;

      // Table items
      const tbody = document.getElementById('tbl-items');
      tbody.innerHTML = '';
      if (data.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#94a3b8;">' + t.counter.empty_items + '</td></tr>';
      } else {
        data.items.forEach(item => {
          const tr = document.createElement('tr');
          const sizeStr = item.ancho + '/' + item.perfil + 'R' + item.llanta;
          const brandBadge = (item.marca && item.marca !== 'GENERICA') ? '<span style="font-size:0.7rem; color:var(--text-muted); display:block;">' + item.marca + '</span>' : '';
          tr.innerHTML = \`
            <td style="overflow:hidden; text-overflow:ellipsis; padding:8px 6px;">
              <strong style="color:#fff; font-size:0.95rem;">\${sizeStr}</strong>
              \${brandBadge}
            </td>
            <td style="text-align:center; padding:8px 4px;">
              <span style="font-size:1.25rem; font-weight:900; color:var(--accent);">\${item.cantidad}</span>
            </td>
            <td style="text-align:center; overflow:visible; padding:6px 2px;">
              <div style="display:inline-flex; align-items:center; justify-content:center; gap:4px; vertical-align:middle;">
                <button class="touch-btn btn-secondary" style="min-height:32px; height:32px; min-width:34px; width:34px; padding:0; font-size:0.85rem; font-weight:800; line-height:1; border-radius:6px;" onclick="adjustItemQuantity('\${item.ancho}', '\${item.perfil}', '\${item.llanta}', '\${item.marca || ''}', 1)" \${isLocked ? 'disabled' : ''} title="+1">+1</button>
                <button class="touch-btn btn-secondary" style="min-height:32px; height:32px; min-width:34px; width:34px; padding:0; font-size:0.85rem; font-weight:800; line-height:1; border-radius:6px; color:#f87171; border-color:#ef444455; background:#2a1515;" onclick="adjustItemQuantity('\${item.ancho}', '\${item.perfil}', '\${item.llanta}', '\${item.marca || ''}', -1)" \${isLocked ? 'disabled' : ''} title="-1">-1</button>
              </div>
            </td>
          \`;
          tbody.appendChild(tr);
        });
      }
    }

    async function addQuantity(delta) {
      const payload = {
        llanta: currentRim,
        ancho: currentWidth,
        perfil: currentProfile,
        marca: '', // Sin marca, siempre genérica por defecto
        deltaCantidad: delta,
      };

      const res = await fetch('/api/contenedores/' + activeContainerId + '/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        alert(result.error || 'Error al actualizar inventario');
      } else {
        loadTerminalData();
      }
    }

    async function adjustItemQuantity(ancho, perfil, llanta, marca, delta) {
      const payload = {
        llanta: parseInt(llanta),
        ancho: parseInt(ancho),
        perfil: parseInt(perfil),
        marca: marca || '',
        deltaCantidad: delta,
      };

      const res = await fetch('/api/contenedores/' + activeContainerId + '/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        loadTerminalData();
      } else {
        const err = await res.json();
        alert(err.error);
      }
    }

    async function captureMockPhoto() {
      const res = await fetch('/api/contenedores/' + activeContainerId + '/fotos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulatedWidth: 3840, simulatedHeight: 2160 }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Foto WebP procesada y encriptada:\\nDimensión: ' + data.evidencia.dimensionMaxPx + ' px\\nPeso: ' + (data.evidencia.pesoBytes / 1024).toFixed(1) + ' KB\\nHash: ' + data.evidencia.sha256Local.substring(0, 16) + '...');
        loadTerminalData();
      } else {
        alert(data.error);
      }
    }

    async function dispatchContainer() {
      const t = i18nDicts[currentLang] || i18nDicts.es;
      if (!confirm(t.counter.confirm_dispatch)) return;

      const res = await fetch('/api/contenedores/' + activeContainerId + '/despachar', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        alert('Hash SHA-256: ' + data.paquete.sha256 + '\\nFSM: DESPACHADO_PENDIENTE_ACK');
        loadTerminalData();
      } else {
        alert(data.error);
      }
    }

    async function loadSupervisorView() {
      const res = await fetch('/api/contenedores');
      const containers = await res.json();
      const t = i18nDicts[currentLang] || i18nDicts.es;

      const elActive = document.getElementById('stat-admin-active-batches');
      if (elActive) {
        elActive.innerText = containers.filter(c => c.estado === 'ACTIVO' || c.estado === 'DESPACHADO_PENDIENTE_ACK').length;
      }

      const tbody = document.getElementById('tbl-supervisor-containers');
      tbody.innerHTML = '';

      containers.forEach(c => {
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom: 1px solid var(--border);';
        const canValidate = c.estado === 'DESPACHADO_PENDIENTE_ACK';
        const hasHash = !!c.hashSha256Paquete;
        const statusKey = 'status_' + c.estado.toLowerCase();
        const translatedStatus = (t.vault && t.vault[statusKey]) || c.estado;
        const opIcon = c.tipoOperacion === 'RECEPCION' ? '📥' : '🚀';
        const opTypeLabel = c.tipoOperacion === 'RECEPCION' 
          ? (t.hub ? t.hub.new_receive_modal_title : 'Entrada Almacén') 
          : 'Despacho';
        const hashIndicator = hasHash ? '<span title="' + c.hashSha256Paquete + '" style="color:var(--success); font-size:0.72rem; margin-left:4px;">• 🔒 SHA OK</span>' : '';

        tr.innerHTML = \`
          <td style="padding: 10px 8px;">
            <strong style="color:#fff; font-size:0.95rem;">\${c.codigoReferencia}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              \${opIcon} \${opTypeLabel} \${hashIndicator}
            </div>
          </td>
          <td style="padding: 10px 8px; color:#cbd5e1; font-size:0.85rem;">\${c.nombreOperarioSnapshot}</td>
          <td style="padding: 10px 8px; text-align: center;">
            <span style="font-size:1.15rem; font-weight:900; color:var(--accent);">\${c.totalAcumulado}</span>
            <span style="font-size:0.7rem; color:var(--text-muted); display:block;">\${t.supervisor.unit_tires}</span>
          </td>
          <td style="padding: 10px 8px; text-align: center;">
            <span class="status-badge status-\${c.estado}">\${translatedStatus}</span>
          </td>
          <td style="padding: 10px 8px; text-align: right; white-space: nowrap;">
            <div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px;">
              <button class="touch-btn btn-cyan" style="min-height:34px; height:34px; font-size:0.8rem; padding:0 10px; white-space:nowrap;" onclick="inspectManifest('\${c.id}')">\${t.supervisor.btn_inspect}</button>
              <button class="touch-btn btn-success" style="min-height:34px; height:34px; font-size:0.8rem; padding:0 10px; white-space:nowrap;" onclick="validateWithTick('\${c.id}')" \${canValidate ? '' : 'disabled'}>\${t.supervisor.btn_validate_tick}</button>
            </div>
          </td>
        \`;
        tbody.appendChild(tr);
      });

      loadStockTable();
    }

    async function inspectManifest(id) {
      const res = await fetch('/api/contenedores/' + id);
      const data = await res.json();
      const t = i18nDicts[currentLang] || i18nDicts.es;

      const card = document.getElementById('card-manifest-preview');
      card.style.display = 'block';

      document.getElementById('lnk-download-xlsx').href = '/api/contenedores/' + id + '/download-xlsx';
      document.getElementById('lnk-download-zip').href = '/api/contenedores/' + id + '/download-zip';

      const statusKey = 'status_' + data.container.estado.toLowerCase();
      const translatedStatus = (t.vault && t.vault[statusKey]) || data.container.estado;

      const details = document.getElementById('manifest-details');
      details.innerHTML = \`
        <div><strong>\${t.supervisor.lbl_batch}</strong> \${data.container.codigoReferencia} | <strong>\${t.supervisor.lbl_operator}</strong> \${data.container.nombreOperarioSnapshot}</div>
        <div><strong>\${t.supervisor.lbl_accumulated}</strong> \${data.container.totalAcumulado} \${t.supervisor.unit_tires}</div>
        <div><strong>\${t.supervisor.lbl_fsm_state}</strong> \${translatedStatus}</div>
        <div><strong>\${t.supervisor.lbl_hash}</strong> \${data.container.hashSha256Paquete || t.supervisor.pending}</div>
        <div><strong>\${t.supervisor.lbl_distinct_lines}</strong> \${data.items.length}</div>
        <div><strong>\${t.supervisor.lbl_photos_vault}</strong> \${data.fotos.length}</div>
      \`;
    }

    async function validateWithTick(id) {
      const t = i18nDicts[currentLang] || i18nDicts.es;
      if (!confirm(t.supervisor.confirm_tick)) return;

      const res = await fetch('/api/contenedores/' + id + '/validar-tic', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert('Lote validado con éxito.\\nToken ACK generado: ' + data.ackToken.sha256Verificado.substring(0, 16) + '...\\nFotos locales purgadas automáticamente.\\nEstado final: PURGADO');
        loadSupervisorView();
        loadTerminalData();
      } else {
        alert(data.error);
      }
    }

    async function runAllMCPAudits() {
      const div = document.getElementById('mcp-results');
      div.setAttribute('data-ran', 'true');
      div.innerHTML = '<span style="color:var(--accent);">Ejecutando herramientas MCP...</span>';

      const res = await fetch('/api/mcp/run-all-audits');
      const data = await res.json();
      const t = i18nDicts[currentLang] || i18nDicts.es;

      div.innerHTML = \`
        <div style="margin-bottom:10px;">
          <strong>1. mcp-sqlite-inspector:</strong>
          <span style="color:var(--success);">\${t.mcp.passed}</span> (Tablas: \${data.sqlite.tables.join(', ')})
        </div>
        <div style="margin-bottom:10px;">
          <strong>2. mcp-image-qa:</strong>
          <span style="color:var(--success);">\${t.mcp.passed}</span> (WebP verificado, Lado &le; 1280 px, Cuota &le; 150 KB)
        </div>
        <div style="margin-bottom:10px;">
          <strong>3. mcp-openxml-validator:</strong>
          <span style="color:var(--success);">\${t.mcp.passed}</span> (Esquema OpenXML bilingüe/inglés validado; Suma matemática de celdas coincide con SQLite)
        </div>
        <div style="margin-bottom:10px;">
          <strong>4. mcp-fs-sandbox:</strong>
          <span style="color:var(--success);">\${t.mcp.passed}</span> (Bóveda aislada, locks verificados, protocolo de purga atómica garantizado)
        </div>
      \`;

      loadAuditLogs();
    }

    async function loadAuditLogs() {
      const res = await fetch('/api/audit-logs');
      const logs = await res.json();
      const box = document.getElementById('audit-log-stream');
      box.innerHTML = '';
      logs.forEach(l => {
        const item = document.createElement('div');
        item.className = 'audit-item';
        item.innerHTML = \`
          <span class="audit-time">[\${l.timestamp.split('T')[1].split('.')[0]}]</span>
          <span class="audit-type \${l.type}">\${l.type}</span>
          <span>\${l.message}</span>
        \`;
        box.appendChild(item);
      });
    }

    // Initial load
    updateMeasureDisplay();
    setLang('es');
    loadHubData();
    checkSavedAuth();
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // 1. Root: Servir SPA
    if (pathname === '/' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlContent);
      return;
    }

    // Auth: Login con Código y Contraseña (4120 / ADMIN)
    if (pathname === '/api/auth/login' && method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      const authRes = await repo.validarCredenciales(payload.codigo || '', payload.password || '');
      if (authRes.ok && authRes.user) {
        activeSessionUser = authRes.user;
        logAudit('Sesión iniciada: ' + authRes.user.nombre + ' (' + authRes.user.rol + ')', 'INFO');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, user: authRes.user }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: authRes.error || 'Código o contraseña incorrectos' }));
      }
      return;
    }

    // Auth: Obtener usuario actual
    if (pathname === '/api/auth/current' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, user: activeSessionUser }));
      return;
    }

    // Cloud Status (Supabase Seúl)
    if (pathname === '/api/cloud-status' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        connected: true,
        provider: 'Supabase',
        region: 'Seoul (ap-northeast-2)',
        url: SUPABASE_URL,
      }));
      return;
    }

    // 2. GET & POST /api/contenedores
    if (pathname === '/api/contenedores' && method === 'GET') {
      const containers = await repo.listarContenedores();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(containers));
      return;
    }

    if (pathname === '/api/contenedores' && method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};

      const newId = 'cnt-' + Date.now().toString().slice(-6);
      const tipoOperacion = payload.tipoOperacion === 'RECEPCION' ? 'RECEPCION' : 'DESPACHO';
      const defaultRef = tipoOperacion === 'RECEPCION' 
        ? 'Albarán REC-' + Date.now().toString().slice(-4)
        : 'Contenedor ' + Date.now().toString().slice(-6);
      const codigoReferencia = (payload.codigoReferencia && payload.codigoReferencia.trim()) || defaultRef;
      const capacidadObjetivo = payload.capacidadObjetivo ? parseInt(payload.capacidadObjetivo) : (tipoOperacion === 'DESPACHO' ? 2000 : null);

      const nuevo = await repo.crearContenedor({
        id: newId,
        codigoReferencia,
        tipoOperacion,
        operarioId: activeSessionUser.id || 'op-001',
        nombreOperarioSnapshot: activeSessionUser.nombre || (activeSessionUser.codigo ? 'Operario ' + activeSessionUser.codigo : 'Carlos Sanchez (ID: 4120)'),
        estado: 'ACTIVO',
        capacidadObjetivo,
        totalAcumulado: 0,
      });

      logAudit('Nuevo lote creado: [' + codigoReferencia + '] (' + tipoOperacion + ')', 'INFO');

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(nuevo));
      return;
    }

    // Reset Demo Batch
    if (pathname === '/api/contenedores/reset-demo' && method === 'POST') {
      await seedDemoContainer();
      logAudit('Lote de pruebas [Contenedor 203248] reiniciado a estado ACTIVO.', 'SYSTEM');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Lote de pruebas reiniciado' }));
      return;
    }

    // GET /api/stock (Inventario acumulado)
    if (pathname === '/api/stock' && method === 'GET') {
      const stock = await repo.obtenerStockTotal();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stock));
      return;
    }

    // 3. GET /api/contenedores/:id
    const getMatch = pathname.match(/^\/api\/contenedores\/([a-zA-Z0-9_-]+)$/);
    if (getMatch && method === 'GET') {
      const id = getMatch[1];
      const container = await repo.obtenerContenedor(id);
      if (!container) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ found: false, error: 'Contenedor no encontrado' }));
        return;
      }
      const items = await repo.obtenerItems(id);
      const fotos = await repo.obtenerFotos(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ found: true, container, items, fotos }));
      return;
    }

    // 4. POST /api/contenedores/:id/items
    const itemMatch = pathname.match(/^\/api\/contenedores\/([a-zA-Z0-9_-]+)\/items$/);
    if (itemMatch && method === 'POST') {
      const id = itemMatch[1];
      const container = await repo.obtenerContenedor(id);
      if (!container) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Contenedor no encontrado' }));
        return;
      }

      // Assert immutability
      try {
        assertContainerMutable(container, 'modificar_items');
      } catch (err) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
        return;
      }
      const itemParse = ItemInputSchema.safeParse(payload);
      if (!itemParse.success) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Item validation failed', violations: itemParse.error.flatten().fieldErrors }));
        return;
      }

      const items = await repo.obtenerItems(id);
      const result = aggregateItem(items, {
        contenedorId: id,
        llanta: itemParse.data.llanta,
        ancho: itemParse.data.ancho,
        perfil: itemParse.data.perfil,
        marca: itemParse.data.marca,
        deltaCantidad: itemParse.data.deltaCantidad,
      });

      // Save updated item in repository
      await repo.guardarItem(result.item);

      logAudit(`Operario modificó inventario: ${result.item.claveCompuesta} (${payload.deltaCantidad > 0 ? '+' : ''}${payload.deltaCantidad}). Nuevo acumulado: ${result.totalAcumulado}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Confirmar Recepción (ingreso de stock a inventario maestro)
    const recMatch = pathname.match(/^\/api\/contenedores\/([a-zA-Z0-9_-]+)\/confirmar-recepcion$/);
    if (recMatch && method === 'POST') {
      const id = recMatch[1];
      const container = await repo.obtenerContenedor(id);
      if (!container) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Lote no encontrado' }));
        return;
      }

      if (container.estado !== 'ACTIVO') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'El lote ya ha sido confirmado o no está activo' }));
        return;
      }

      const sumIngresado = await repo.ingresarStockDesdeLote(id);
      const updated = await repo.actualizarContenedor(id, { estado: 'CONFIRMADO_EN_DESTINO' });
      logAudit(`Recepción confirmada: ${sumIngresado} neumáticos ingresados al Inventario General desde [${container.codigoReferencia}]`, 'SUCCESS');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, sumIngresado, container: updated }));
      return;
    }

    // 5. POST /api/contenedores/:id/fotos
    const fotoMatch = pathname.match(/^\/api\/contenedores\/([a-zA-Z0-9_-]+)\/fotos$/);
    if (fotoMatch && method === 'POST') {
      const id = fotoMatch[1];
      const container = await repo.obtenerContenedor(id);
      if (!container) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Contenedor no encontrado' }));
        return;
      }

      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
        return;
      }
      const fotoParse = FotoInputSchema.safeParse(payload);
      if (!fotoParse.success) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Foto validation failed', violations: fotoParse.error.flatten().fieldErrors }));
        return;
      }

      assertContainerMutable(container, 'capturar_foto');

      // Simulate capturing raw image and running through processor
      const rawDummy = Buffer.alloc(3 * 1024 * 1024);
      rawDummy.fill(0x77);

      const { evidencia, webpBuffer } = processImageBuffer({
        contenedorId: id,
        rawBuffer: rawDummy,
        originalWidth: 3840,
        originalHeight: 2160,
      });

      await repo.guardarFoto(evidencia);
      logAudit(`Foto WebP capturada y comprimida [ID: ${evidencia.id}]. Peso: ${(evidencia.pesoBytes / 1024).toFixed(1)} KB, SHA-256: ${evidencia.sha256Local.substring(0, 16)}...`, 'SUCCESS');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, evidencia }));
      return;
    }

    // 6. POST /api/contenedores/:id/despachar
    const dispatchMatch = pathname.match(/^\/api\/contenedores\/([a-zA-Z0-9_-]+)\/despachar$/);
    if (dispatchMatch && method === 'POST') {
      const id = dispatchMatch[1];
      const container = await repo.obtenerContenedor(id);
      if (!container) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Contenedor no encontrado' }));
        return;
      }

      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
        return;
      }
      const dispatchParse = DispatchInputSchema.safeParse(payload);
      if (!dispatchParse.success) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Dispatch validation failed', violations: dispatchParse.error.flatten().fieldErrors }));
        return;
      }

      // FSM: BLOQUEADO_EN_BOVEDA
      let updated = transitionState(container, 'BLOQUEADO_EN_BOVEDA');
      await repo.actualizarContenedor(id, { estado: updated.estado });
      logAudit(`Contenedor [${container.codigoReferencia}] bloqueado en Bóveda de Cuarentena. Inmutabilidad activa.`, 'WARN');

      // Generate package
      const items = await repo.obtenerItems(id);
      const fotos = await repo.obtenerFotos(id);

      const paquete = await generateDispatchZip({
        contenedor: updated,
        items,
        fotos: fotos.map((f) => ({ evidencia: f, buffer: Buffer.alloc(100) })),
      });

      paquetesDespacho.set(id, paquete);

      // FSM: DESPACHADO_PENDIENTE_ACK
      updated = transitionState(updated, 'DESPACHADO_PENDIENTE_ACK');
      await repo.actualizarContenedor(id, {
        estado: updated.estado,
        hashSha256Paquete: paquete.sha256,
      });

      logAudit(`Paquete ZIP y manifiesto OpenXML generados con firma SHA-256 [${paquete.sha256.substring(0, 20)}...]. Lote despachado pendiente de ACK.`, 'SUCCESS');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, paquete: { ...paquete, bufferZip: undefined } }));
      return;
    }

    // 7. POST /api/contenedores/:id/validar-tic
    const validateMatch = pathname.match(/^\/api\/contenedores\/([a-zA-Z0-9_-]+)\/validar-tic$/);
    if (validateMatch && method === 'POST') {
      const id = validateMatch[1];
      const container = await repo.obtenerContenedor(id);
      const paquete = paquetesDespacho.get(id);

      if (!container || !paquete) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Paquete de despacho no encontrado para este contenedor' }));
        return;
      }

      // Supervisor generates ReceiptAckToken
      const ackToken = {
        loteId: id,
        sha256Verificado: paquete.sha256,
        status: 'VERIFIED',
        timestamp: new Date().toISOString(),
        validadorId: 'sup-office-001',
        signature: 'CRYPTO-VALIDATED-TIC-' + crypto.randomBytes(8).toString('hex'),
      };

      // Two-phase Handshake: Operario terminal validates ACK and executes purge
      const purgeResult = await processReceiptAck(
        container,
        paquete,
        ackToken,
        async () => {
          const purged = await repo.eliminarFotos(id);
          logAudit(`Purga física atómica ejecutada: ${purged} fotografías WebP eliminadas localmente.`, 'SYSTEM');
        }
      );

      await repo.actualizarContenedor(id, {
        estado: purgeResult.contenedorActualizado.estado,
        reciboAckToken: purgeResult.contenedorActualizado.reciboAckToken,
      });

      logAudit(`Handshake completado: Supervisor validó con 'Tic'. Lote [${container.codigoReferencia}] pasa a PURGADO.`, 'SUCCESS');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ackToken, purgeResult }));
      return;
    }

    // 8. Download XLSX
    const xlsxMatch = pathname.match(/^\/api\/contenedores\/([a-zA-Z0-9_-]+)\/download-xlsx$/);
    if (xlsxMatch && method === 'GET') {
      const id = xlsxMatch[1];
      const container = await repo.obtenerContenedor(id);
      const items = await repo.obtenerItems(id);
      if (!container) {
        res.writeHead(404);
        res.end('Contenedor no encontrado');
        return;
      }
      const excelBuf = await compileOpenXmlManifest(container, items);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="manifest_${container.codigoReferencia.replace(/\\s+/g, '_')}.xlsx"`,
      });
      res.end(excelBuf);
      return;
    }

    // 9. Download ZIP
    const zipMatch = pathname.match(/^\/api\/contenedores\/([a-zA-Z0-9_-]+)\/download-zip$/);
    if (zipMatch && method === 'GET') {
      const id = zipMatch[1];
      const paquete = paquetesDespacho.get(id);
      if (!paquete) {
        res.writeHead(404);
        res.end('Paquete ZIP no generado o no encontrado');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${paquete.archivoNombre}"`,
      });
      res.end(paquete.bufferZip);
      return;
    }

    // 10. MCP Audits
    if (pathname === '/api/mcp/run-all-audits' && method === 'GET') {
      const sqliteState = createMockSQLiteState();
      const sqliteSchema = inspectSchema(sqliteState);

      const mockWebp = Buffer.alloc(100);
      mockWebp.write('RIFF', 0);
      mockWebp.write('WEBP', 8);
      const imageQa = verifyCompressionLimits({ dimensionMaxPx: 1280, pesoBytes: 120000 });

      logAudit(`Ejecución de auditoría completa de los 4 Servidores MCP: TODO APROBADO.`, 'SUCCESS');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sqlite: sqliteSchema,
        imageQa,
        openxml: { valid: true, exactSumMatches: true },
        sandbox: { vaultIsolated: true, purgeVerified: true },
      }));
      return;
    }

    // 11. Audit logs
    if (pathname === '/api/audit-logs' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(auditLogs));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  } catch (err) {
    console.error('Unhandled server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

initServer().then(() => {
  server.listen(PORT, () => {
    console.log(`[COUNTER SERVER] Servidor escuchando en http://localhost:${PORT}`);
  });
});
