# Tire Counter Monorepo

**Sistema Integral de Clasificación, Conteo y Despacho de Neumáticos**

Monorepo TypeScript con arquitectura offline-first, FSM de lotes, compresión WebP, validación OpenXML y sincronización Supabase.

---

## 🏗️ Arquitectura

```
tire-counter-monorepo/
├── packages/
│   └── core-contracts/       # Tipos, Zod schemas, FSM, i18n, repositorio híbrido
├── apps/
│   ├── mobile/               # React Native / Expo (planeado, edge/offline-first)
│   └── receptor-desktop/     # Fastify + React (estación de recepción/validación)
├── tools/
│   └── mcp-servers/          # 4 servidores MCP para auditoría y testing
├── docs/                     # Especificaciones SDD, dominio, i18n, TDD, Supabase
└── agents.md                 # Arquitectura multiagente del DOMINIO (ver abajo)
```

---

## 🧩 Workspaces

| Paquete | Descripción | Tests | Build |
|---------|-------------|-------|-------|
| `@tire-counter/core-contracts` | Contratos Zod, FSM, tipos, i18n, repositorio offline-first | ✅ 27 passing | ✅ `tsc` |
| `@tire-counter/mcp-servers` | 4 servidores MCP (SQLite, Image QA, OpenXML, FS Sandbox) | ✅ 6 passing | ✅ `tsc` |
| `@tire-counter/receptor-desktop` | Servidor Fastify + UI React (estación receptora) | — | — |

---

## 🚀 Inicio Rápido

```bash
# Instalar dependencias
npm install

# Tests
npm test

# Build todos los workspaces
npm run build

# Desarrollo receptor-desktop
cd apps/receptor-desktop
cp .env.example .env  # Configurar SUPABASE_KEY, SUPABASE_URL
npm start
```

### Variables de entorno (`apps/receptor-desktop/.env`)

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=sb_secret_tu_key_aqui
PORT=3000
```

---

## 🤖 Agentes: Dominio vs Desarrollo

| Tipo | Agentes | Propósito |
|------|---------|-----------|
| **Dominio (aplicación)** | `orchestrator`, `aggregator`, `processor`, `list packer`, `dispatch coordinator`, `auditor` | Lógica de negocio del sistema de neumáticos (ver `agents.md`) |
| **Desarrollo (gentle-ai)** | `gentle-orchestrator`, `gentle-ai-explore`, `gentle-ai-verify`, `gentle-ai-worker`, `jd-fix-agent`, `jd-judge-a/b`, reviewers R1-R4 | Asistentes de código IA para desarrollo (ODD, reviews, etc.) |

> **Nota**: Los agentes de **dominio** son la arquitectura del sistema. Los agentes de **desarrollo** son herramientas IA que usan ODD/Judgment Day para escribir código.

---

## 🔧 Servidores MCP (tools/mcp-servers)

| Servidor | Propósito | Herramientas |
|----------|-----------|--------------|
| `mcp-sqlite-inspector` | Auditar DDL SQLite, consultar estado contenedores | `inspect_schema`, `query_container_state`, `verify_vault_isolation` |
| `mcp-image-qa` | Validar WebP: dimensiones ≤1280px, peso <150KB | `inspect_image_metadata`, `verify_compression_limits`, `check_webp_integrity` |
| `mcp-openxml-validator` | Validar .xlsx despacho, sumas vs SQLite | `parse_xlsx_structure`, `audit_manifest_totals`, `inspect_zip_archive` |
| `mcp-fs-sandbox` | Monitorear almacenamiento, purga atómica | `verify_vault_storage`, `trace_purge_execution`, `check_file_locks` |

---

## 📚 Documentación

| Archivo | Descripción |
|---------|-------------|
| `docs/contexto_y_alcance.md` | Contexto y alcance del proyecto |
| `docs/especificacion_dominio_sdd.md` | Especificación SDD del dominio |
| `docs/internacionalizacion_i18n.md` | i18n (ES/EN/KO/RU/ZH) |
| `docs/protocolo_tdd_y_calidad.md` | Protocolo TDD y calidad |
| `docs/requisitos_funcionales_y_no_funcionales.md` | Requisitos funcionales y no funcionales |
| `docs/supabase_offline_guide.md` | Guía offline-first Supabase |
| `docs/supabase_schema.sql` | Esquema SQL completo (RLS, enums, tablas) |
| `agents.md` | Arquitectura multiagente del dominio |

---

## 🔄 Flujo de Despacho (FSM)

```
ACTIVO → BLOQUEADO_EN_BOVEDA → DESPACHADO_PENDIENTE_ACK → CONFIRMADO_EN_DESTINO → PURGADO
    │           │                      │                        │                  │
    │           │                      │                        │                  └─ Purga física fotos
    │           │                      │                        └─ Supervisor valida ACK
    │           │                      └─ Genera .zip (.xlsx + WebP) + SHA-256
    │           └─ Bloqueo UI, inmutabilidad bóveda
    └─ Operario cuenta neumáticos
```

---

## 🛠️ Desarrollo con gentle-ai

Este repo integra **gentle-ai** (ODD, Judgment Day, Engram, CodeGraph, Skills):

```bash
# CodeGraph (búsqueda semántica)
gentle-ai codegraph init --cwd .

# Engram (memoria persistente)
engram save "feature" "descripción" --type config --scope project

# Skills disponibles: judgment-day, chained-pr, work-unit-commits, skill-creator, etc.
```

---

## 📦 Tech Stack

- **TypeScript** 5.9+ (strict, CommonJS)
- **Vitest** 3.x (tests unitarios/integración)
- **Zod** 3.24+ (validación runtime)
- **Fastify** (receptor-desktop)
- **SQLite** (local) + **Supabase/PostgreSQL** (cloud)
- **ExcelJS** + **JSZip** (OpenXML despacho)
- **MCP** (Model Context Protocol) para tooling

---

## 🤝 Contribuir

1. Fork + branch (`feature/nombre` o `fix/nombre`)
2. Tests pasan: `npm test`
3. Build ok: `npm run build`
4. PR con descripción clara

---

## 📄 Licencia

MIT — ver `LICENSE` (pendiente)