# ARQUITECTURA MULTIAGENTE DEL DOMINIO — TIRE COUNTER

> **Importante**: Este documento describe los **agentes de la APLICACIÓN** (lógica de negocio del sistema de neumáticos).
> Los agentes de **DESARROLLO** (gentle-ai: `gentle-orchestrator`, `gentle-ai-explore`, etc.) están en `.config/opencode/agents/` y usan ODD/Judgment Day para escribir código.

---

## 1. TOPOLOGÍA DE ARCHIVOS EN EL MONOREPO

```text
Counter/
├── packages/
│   └── core-contracts/           # Contratos Zod, tipos TS, FSM, interfaces de agentes de DOMINIO
├── apps/
│   ├── mobile/                   # React Native / Expo (Edge / Offline-First) — planeado
│   └── receptor-desktop/         # Fastify + React (estación recepción/validación)
├── tools/
│   └── mcp-servers/              # SERVIDORES MCP DE AUDITORÍA Y TESTING
│       ├── mcp-sqlite-inspector/ # Inspección DDL, consultas, estado SQLite
│       ├── mcp-image-qa/         # Verificación WebP, dimensiones, cuotas compresión
│       ├── mcp-openxml-validator/# Validación OpenXML (.xlsx) y sumas
│       └── mcp-fs-sandbox/       # Monitoreo bóveda, locks, purga atómica
├── docs/                         # Especificaciones SDD, dominio, i18n, TDD, Supabase
└── agents.md                     # Este archivo: arquitectura multiagente del DOMINIO
```

---

## 2. ARQUITECTURA MULTIAGENTE (DOMINIO)

El sistema opera bajo esquema coordinado y supervisado: **ningún dato/artefacto se persiste o despacha sin validación del `auditor` (Gatekeeper QA)**.

```
                              ┌───────────────────────┐
                              │    orchestrator       │  ← FSM & Coordinador CENTRAL (dominio)
                              │  (core-contracts/fsm) │
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
                             │         auditor         │  ← Gatekeeper QA (rechaza inválidos)
                             └─────────────────────────┘
```

---

## 3. MATRIZ DE AGENTES DE DOMINIO Y CONTRATOS

| Agente | Ubicación Lógica | Rol Técnico | Entrada (Payload Contract) | Salida (Artifact / Event) | Invariante de Auditoría (`auditor`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`orchestrator`** | `core-contracts/fsm` | Máquina de Estados FSM & Coordinador central | Acciones usuario, eventos contenedor | Comandos a subagentes; Estado FSM persistido | Transiciones FSM legales y deterministas (`ACTIVO` → `BLOQUEADO_EN_BOVEDA` → `DESPACHADO_PENDIENTE_ACK` → `CONFIRMADO_EN_DESTINO` → `PURGADO`). Bloqueo inmediato tras despacho. |
| **`aggregator`** | `core-contracts/aggregator.ts` | Agregación de Inventario | `{ contenedorId, llanta, ancho, perfil, marca?, deltaCantidad }` | `ItemNeumatico` consolidado + Snapshot totales | Consolidación estricta por `claveCompuesta` (`${ancho}/${perfil}R${llanta}--${marca \|\| 'GENERICA'}`). `cantidad >= 1`. Cero duplicados en BD. |
| **`processor`** | `core-contracts/agents/processor.ts` | Pipeline de Imagen Edge | `ByteStream` crudo + `contenedorId` | `EvidenciaFoto` (WebP, metadata, hash local SHA-256) | Formato WebP nativo, lado mayor ≤ 1280 px, peso estricto < 153.600 bytes (150 KB). |
| **`list packer`** | `core-contracts/agents/list-packer.ts` | Compilador OpenXML y empaquetador ZIP | Snapshot inmutable de lote cerrado | `PaqueteDespacho` (`.zip` con `.xlsx` bilingüe ES/EN + fotos) + SHA-256 | Estructura OpenXML válida; suma matemática en celdas Excel exactamente idéntica al `totalAcumulado` en SQLite. |
| **`dispatch coordinator`** | `core-contracts/dispatch.ts` | Protocolo Transporte & Purga | `PaqueteDespacho` + `ReceiptAckToken` | Orden de purga atómica local ejecutada | Coincidencia criptográfica estricta: `hash_ack == hash_local`. Aborto fulminante y bloqueo de borrado si token/hash inválido. |
| **`auditor`** | `core-contracts/auditor` + `tools/mcp-servers` | Gatekeeper QA y Validación Continua | Payloads, esquemas, binarios generados por agentes | `AuditVerdict` (`approved: boolean`, `violations: string[]`) | Rechaza cualquier artefacto, violación i18n, inconsistencia cantidades o transición fuera del estándar SDD. |

> **Nota**: El `orchestrator` aquí es el **coordinador de dominio** (FSM en `core-contracts/fsm.ts`), NO el `gentle-orchestrator` de desarrollo.

---

## 4. CATÁLOGO DE SERVIDORES MCP (TESTING/AUDITORÍA)

Residen en `tools/mcp-servers/` y proveen herramientas programáticas para validación automatizada durante desarrollo, tests y CI.

### 4.1 `mcp-sqlite-inspector` (`tools/mcp-servers/src/mcp-sqlite-inspector`)
- **Propósito**: Auditar DDL SQLite embebida, inspeccionar tablas, comprobar atomicidad transacciones inventario.
- **Herramientas**: `inspect_schema`, `query_container_state`, `verify_vault_isolation`

### 4.2 `mcp-image-qa` (`tools/mcp-servers/src/mcp-image-qa`)
- **Propósito**: Validar que evidencia fotográfica no exceda dimensiones máximas ni peso estricto.
- **Herramientas**: `inspect_image_metadata`, `verify_compression_limits`, `check_webp_integrity`

### 4.3 `mcp-openxml-validator` (`tools/mcp-servers/src/mcp-openxml-validator`)
- **Propósito**: Verificar conformidad binario `.xlsx` despacho y contrastar sumas vs SQLite.
- **Herramientas**: `parse_xlsx_structure`, `audit_manifest_totals`, `inspect_zip_archive`

### 4.4 `mcp-fs-sandbox` (`tools/mcp-servers/src/mcp-fs-sandbox`)
- **Propósito**: Monitorear almacenamiento sandbox app, verificar aislamiento bóveda cuarentena, auditar purga atómica tras ACK.
- **Herramientas**: `verify_vault_storage`, `trace_purge_execution`, `check_file_locks`

---

## 5. CICLO OPERATIVO PROTOCOLO DESPACHO Y PURGA

```
   Terminal Móvil (Operario)                                Estación Receptora (Supervisor/PC)
  ─────────────────────────────                            ────────────────────────────────────
               │                                                           │
      [1] Pulsa "Despachar Lote"                                               │
      [2] FSM: BLOQUEADO_EN_BOVEDA                                             │
          - Bloqueo UI y borrado pantalla activa                               │
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
          - SÍ: Purga física fotos locales WebP.
                FSM pasa a PURGADO.
          - NO: ABORTO purga, alarma a auditor,
                archivos preservados en bóveda.
```

---

## 6. AGENTES DE DESARROLLO (gentle-ai) — RESUMEN

| Agente gentle-ai | Propósito | Modo |
|------------------|-----------|------|
| `gentle-orchestrator` | ODD: autoriza, explora, trackea features, implementa, verifica, commitea | `default_agent` en OpenCode |
| `gentle-ai-explore` | Exploración read-only, mapeo código, CodeGraph | subagent hidden |
| `gentle-ai-verify` | Verificación técnica read-only, probes derivados de specs | subagent hidden |
| `gentle-ai-worker` | Implementación acotada, tests enfocados, evidence review-ready | subagent hidden |
| `jd-fix-agent` | Fixes quirúrgicos para findings Judgment Day confirmados | subagent hidden |
| `jd-judge-a/b` | Revisión adversarial ciega independiente (2 jueces) | subagent hidden |
| `review-risk/readability/reliability/resilience` | Lentes R1-R4 (security, naming, tests, ops) | subagent hidden |

Configuración en: `~/.config/opencode/opencode.jsonc` (global) o `.opencode/` (workspace).

---

## 7. DISTINCIÓN CLAVE

| Concepto | `orchestrator` (dominio) | `gentle-orchestrator` (dev) |
|----------|--------------------------|----------------------------|
| **Qué es** | FSM central de la app de neumáticos | Asistente IA que ejecuta ODD |
| **Dónde vive** | `packages/core-contracts/src/fsm.ts` | Prompt en `opencode.jsonc` |
| **Ejecuta** | Transiciones de estado de lotes | Workflow: autorizar → explorar → documentar → implementar → verificar → commit |
| **Valida** | Invariantes de negocio (auditor) | Specs ODD, tests, código |

> **Regla**: En código y docs del dominio, "orchestrator" = FSM. En config de desarrollo, "gentle-orchestrator" = agente IA.