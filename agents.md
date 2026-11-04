# TOPOLOGÍA MULTIAGENTE Y SERVIDORES MCP (MODEL CONTEXT PROTOCOL)

Este documento define la arquitectura multiagente del sistema, la matriz formal de contratos de entrada/salida, las invariantes de auditoría y el catálogo de servidores MCP (Model Context Protocol) ubicados en el monorepo.

---

## 1. UBICACIÓN Y TOPOLOGÍA DE ARCHIVOS EN EL MONOREPO

```text
Counter/
├── packages/
│   └── core-contracts/           # Contratos Zod, tipos TypeScript, FSM e interfaces de agentes
├── apps/
│   ├── mobile/                   # App React Native / Expo (Edge / Offline-First)
│   └── receptor-desktop/         # Estación de recepción y validación (Node.js/Fastify + React)
├── tools/
│   └── mcp-servers/              # SERVIDORES MCP DE AUDITORÍA Y TESTING
│       ├── mcp-sqlite-inspector/ # Inspección DDL, consultas y estado SQLite
│       ├── mcp-image-qa/         # Verificación WebP, dimensiones y cuotas de compresión
│       ├── mcp-openxml-validator/# Validación de estructura OpenXML (.xlsx) y sumas
│       └── mcp-fs-sandbox/       # Monitoreo de bóveda, locks y purga atómica
├── docs/                         # Documentación de contexto y especificación de dominio
└── agents.md                     # Este archivo de referencia de agentes y herramientas MCP
```

---

## 2. ARQUITECTURA MULTIAGENTE

El sistema opera bajo un esquema coordinado y supervisado donde ningún dato o artefacto se persiste ni se despacha sin la validación del Gatekeeper (`auditor`).

```
                             ┌───────────────────────┐
                             │     orchestrator      │
                             │ (FSM & Coordinador)   │
                             └───────────┬───────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
        ▼                                ▼                                ▼
  ┌────────────┐                   ┌───────────┐                  ┌───────────────┐
  │ aggregator │                   │ processor │                  │  list packer  │
  └────────────┘                   └───────────┘                  └───────────────┘
        │                                │                                │
        └────────────────────────────────┼────────────────────────────────┘
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │  dispatch coordinator   │
                            │ (ACK Handshake & Purga) │
                            └────────────┬────────────┘
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │         auditor         │
                            │   (QA Gatekeeper)       │
                            └─────────────────────────┘
```

---

## 3. MATRIZ DETALLADA DE AGENTES Y CONTRATOS

| Agente | Ubicación Lógica | Rol Técnico | Entrada (Payload Contract) | Salida (Artifact / Event) | Invariante de Auditoría (`auditor`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`orchestrator`** | `core-contracts/fsm` & `apps/mobile/src/orchestrator` | Máquina de Estados FSM & Coordinador | Acciones de usuario, eventos de contenedor | Comandos a subagentes; Estado FSM persistido | Transiciones FSM legales y deterministas (`ACTIVO` $\to$ `BLOQUEADO_EN_BOVEDA` $\to$ `DESPACHADO_PENDIENTE_ACK` $\to$ `CONFIRMADO_EN_DESTINO` $\to$ `PURGADO`). Bloqueo inmediato tras despacho. |
| **`aggregator`** | `apps/mobile/src/agents/aggregator` | Agregación de Inventario | `{ contenedorId, llanta, ancho, perfil, marca?, deltaCantidad }` | `ItemNeumatico` consolidado + Snapshot de totales | Consolidación estricta por `claveCompuesta` (`${ancho}/${perfil}R${llanta}--${marca \|\| 'GENERICA'}`). `cantidad >= 1`. Cero duplicados en base de datos. |
| **`processor`** | `apps/mobile/src/agents/processor` | Pipeline de Imagen Edge | `ByteStream` crudo + `contenedorId` | `EvidenciaFoto` (WebP, metadata, hash local SHA-256) | Formato WebP nativo, lado mayor $\le 1280\text{ px}$, peso estricto $< 153.600\text{ bytes}$ (150 KB). |
| **`list packer`** | `apps/mobile/src/agents/list-packer` | Compilador OpenXML y empaquetador ZIP | Snapshot inmutable de lote cerrado | `PaqueteDespacho` (`.zip` con `.xlsx` internacional bilingüe/inglés + fotos) + SHA-256 | Estructura OpenXML válida; suma matemática en celdas Excel exactamente idéntica al total acumulado en SQLite. |
| **`dispatch coordinator`** | `apps/mobile/src/agents/dispatch` | Protocolo de Transporte & Purga | `PaqueteDespacho` + `ReceiptAckToken` | Orden de purga atómica local ejecutada | Coincidencia criptográfica estricta: `hash_ack == hash_local`. Aborto fulminante y bloqueo de borrado si el token/hash es inválido. |
| **`auditor`** | `core-contracts/auditor` & `tools/mcp-servers` | Gatekeeper de QA y Validación Continua | Payloads, esquemas y binarios generados por los agentes | `AuditVerdict` (`approved: boolean`, `violations: string[]`) | Rechaza cualquier artefacto, violación i18n, inconsistencia de cantidades o transición fuera del estándar SDD. |

---

## 4. CATÁLOGO DE SERVIDORES MCP (MODEL CONTEXT PROTOCOL)

Los servidores MCP residen en `tools/mcp-servers/` y proporcionan herramientas programáticas de inspección y validación automatizada para los agentes durante el desarrollo, pruebas e integración continua:

### 4.1 `mcp-sqlite-inspector` (`tools/mcp-servers/mcp-sqlite-inspector`)
- **Propósito:** Auditar el DDL de la base de datos SQLite embebida, inspeccionar tablas y comprobar la atomicidad de las transacciones de inventario.
- **Herramientas expuestas:**
  - `inspect_schema`: Inspecciona las tablas, índices y restricciones en la base de datos local.
  - `query_container_state`: Consulta el estado actual de un contenedor, sus items acumulados y el historial transaccional.
  - `verify_vault_isolation`: Comprueba que los registros en estado `BLOQUEADO_EN_BOVEDA` no permitan operaciones de inserción o actualización (inmutabilidad).

### 4.2 `mcp-image-qa` (`tools/mcp-servers/mcp-image-qa`)
- **Propósito:** Validar en tiempo de ejecución o en suite de pruebas que ninguna evidencia fotográfica exceda las dimensiones máximas ni el peso estricto en bytes.
- **Herramientas expuestas:**
  - `inspect_image_metadata`: Extrae resolución (ancho x alto), espacio de color y formato del archivo.
  - `verify_compression_limits`: Verifica que el archivo no supere el límite de $153.600\text{ bytes}$ ($150\text{ KB}$) y que su lado mayor sea $\le 1280\text{ px}$.
  - `check_webp_integrity`: Comprueba la integridad estructural del encabezado RIFF/WebP y la validez del checksum.

### 4.3 `mcp-openxml-validator` (`tools/mcp-servers/mcp-openxml-validator`)
- **Propósito:** Verificar la conformidad del binario `.xlsx` de despacho y contrastar las sumas matemáticas contra los datos en SQLite.
- **Herramientas expuestas:**
  - `parse_xlsx_structure`: Valida el esquema OpenXML, hojas requeridas y consistencia del XML subyacente.
  - `audit_manifest_totals`: Extrae y suma todas las celdas numéricas de cantidad en el Excel, comparándolas contra el `totalAcumulado` del lote.
  - `inspect_zip_archive`: Examina el contenido del archivo `.zip` de despacho, verificando la presencia del manifiesto Excel y todas las fotos referenciadas con sus hashes SHA-256.

### 4.4 `mcp-fs-sandbox` (`tools/mcp-servers/mcp-fs-sandbox`)
- **Propósito:** Monitorear el almacenamiento en el sandbox de la app, verificar el aislamiento de la bóveda de cuarentena y auditar la purga atómica de archivos tras el ACK.
- **Herramientas expuestas:**
  - `verify_vault_storage`: Comprueba los permisos y aislamiento de la carpeta de cuarentena local.
  - `trace_purge_execution`: Registra y valida la secuencia de borrado físico de fotos tras la recepción satisfactoria de un `ReceiptAckToken`.
  - `check_file_locks`: Verifica si existen descriptores de archivo abiertos o bloqueos pendientes que impidan la purga atómica.

---

## 5. CICLO OPERATIVO DEL PROTOCOLO DE DESPACHO Y PURGA

```
   Terminal Móvil (Operario)                                Estación Receptora (Supervisor/PC)
  ─────────────────────────────                            ────────────────────────────────────
                │                                                           │
   [1] Pulsa "Despachar Lote"                                               │
   [2] FSM: BLOQUEADO_EN_BOVEDA                                             │
       - Bloqueo UI y borrado de pantalla activa                            │
       - list-packer genera .xlsx + .zip con SHA-256 (H1)                    │
       - FSM: DESPACHADO_PENDIENTE_ACK                                      │
                │                                                           │
                │──────── Envío ZIP / Red Local / P2P ─────────────────────>│
                │                                                           │
                │                                               [3] Ingesta y Validación
                │                                                   - Calcula SHA-256 (H2)
                │                                                   - Comprueba H2 == H1
                │                                                   - Supervisor pulsa "Tic"
                │                                                   - Emite ReceiptAckToken
                │                                                           │
                │<─────── Envío ReceiptAckToken firmado ────────────────────│
                │
   [4] dispatch-coordinator valida token:
       - ¿Hash en ACK coincide con H1 local?
       - SÍ: Purga física de fotos locales WebP.
             FSM pasa a PURGADO.
       - NO: ABORTO de purga, alarma a auditor,
             archivos preservados en bóveda.
```
