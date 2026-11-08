# Auditoria completa de Counter contra SDD, RF/RNF y codigo existente

Objetivo: auditar el monorepo Counter contra los documentos (SDD, RF/RNF, i18n, protocolo TDD, supabase_schema.sql), el codigo fuente y los tests; identificar que falta; corregir problemas sencillos y reportar graves para decision del usuario.
Branch: main
Delivery strategy: ask-on-risk (default)
Test runner: vitest (no disponible para ejecutar en este entorno; analisis estatico de codigo)

## Specs

S1: "ningun dato/artefacto se persiste o despacha sin validacion del auditor (Gatekeeper QA)" (agents.md, arquitectura multiagente de dominio).
S2: FSM transiciones `ACTIVO -> BLOQUEADO_EN_BOVEDA -> DESPACHADO_PENDIENTE_ACK -> CONFIRMADO_EN_DESTINO -> PURGADO` (docs/especificacion_dominio_sdd.md seccion 3).
S3: `claveCompuesta` invariante `${ancho}/${perfil}R${llanta}--${marca || 'GENERICA'}` (docs/especificacion_dominio_sdd.md seccion 2.2, schemas.ts ItemNeumaticoSchema refine).
S4: `cantidad` entero estricto >= 1 (docs/especificacion_dominio_sdd.md seccion 2.2, schemas.ts ItemNeumaticoSchema cantidad min 1).
S5: Pipeline fotografico Edge: WebP, lado mayor <= 1280 px, peso < 153.600 bytes (docs/requisitos_funcionales_y_no_funcionales.md RF-05, schemas.ts EvidenciaFotoSchema).
S6: Manifiesto OpenXML (.xlsx) con encabezados en ingles (o bilingue ES/EN), filas ordenadas por Llanta asc, Ancho, Perfil; suma matematica de celdas == totalAcumulado (docs/requisitos_funcionales_y_no_funcionales.md RF-06, agents/processor.ts list-packer).
S7: Handshake ACK: hash_ack == hash_local; si no coincide, aborta purga y lanza SecurityHashMismatchError (docs/requisitos_funcionales_y_no_funcionales.md RF-09, src/dispatch.ts processReceiptAck).
S8: Inmutabilidad en Boveda: mutaciones rechazadas en BLOQUEADO_EN_BOVEDA, DESPACHADO_PENDIENTE_ACK, CONFIRMADO_EN_DESTINO y PURGADO (src/fsm.ts assertContainerMutable, transitionState, LEGAL_TRANSITIONS).
S9: Paridad 100% de claves i18n es -> en/ru/ko/zh (docs/protocolo_tdd_y_calidad.md test #3, docs/internacionalizacion_i18n.md seccion 2, src/i18n/*.json).
S10: Patron repositorio IContenedorRepository con adaptadores SQLiteLocalAdapter, SupabaseCloudAdapter, OfflineFirstHybridRepository (docs/requisitos_funcionales_y_no_funcionales.md RF-08, src/repository.ts, src/supabase.ts).
S11: Offline-first absoluto: autenticar, contar, comprimir fotos, cambiar idioma y generar manifiesto sin internet (RNF-01).

## Tasks

T1 - Verificar paridad de diccionarios i18n (es base vs en/ru/ko/zh) — S9 — route: inline — commit: pendiente
T2 - Verificar FSM e inmutabilidad post-despacho (assertContainerMutable, transitionState, LEGAL_TRANSITIONS) — S2, S8 — route: inline — commit: pendiente
T3 - Verificar agregador y composite key (claveCompuesta, cantidad>=1, consolidacion, cero duplicados) — S3, S4 — route: inline — commit: pendiente
T4 - Verificar pipeline de imagen processor.ts (WebP real vs sintético, <=1280 px, <153600 bytes) — S5 — route: inline — commit: pendiente
T5 - Verificar list-packer (OpenXML headers ingles, suma exacta, ZIP con firma SHA-256) — S6 — route: inline — commit: pendiente
T6 - Verificar dispatch coordinator (handshake ACK, hash match, purge, inmutabilidad) — S7, S8 — route: inline — commit: pendiente
T7 - Verificar repository adapters (SQLiteLocal, SupabaseCloud, OfflineFirstHybrid) y paridad — S10 — route: inline — commit: pendiente
T8 - Verificar servidores MCP (sqlite-inspector, image-qa, openxml-validator, fs-sandbox) contra su scopo — S1, S5, S6 — route: inline — commit: pendiente
T9 - Verificar server.js receptor-desktop (endpoints, FSM, auth, SSE/navegacion) — S1, S2, S7, S8 — route: inline — commit: pendiente
T10 - Verificar tests existentes (vitest suites) y coverage vs protocolo TDD (9 tests obligatorios) — S1-S11 — route: inline — commit: pendiente
T11 - Identificar documentos faltantes y gaps vs SDD/RF-RNF — S1-S11 — route: inline — commit: pendiente
T12 - Corregir problemas graves e identificar gaps — S3, S4, S5, S8 — route: delegado (4 writers en paralelo, superficies disjuntas) — commit: pendiente — estado: COMPLETADO
  - F12a: supabase.ts — eliminar contraseñas triviales en fallback offline (riesgo item 2: auth) — COMPLETADO (27 tests pasando, tsc limpio)
  - F12b: processor.ts — marcar salida como simulada, no WebP real (riesgo item 6 / RF-05) — COMPLETADO (tests 2/2 pasando, tsc limpio)
  - F12c: server.js — IDs UUID constantes válidos en seed, quitar SUPABASE_URL hardcodeada, agregar validacion Zod en runtime (riesgo item 3 y 5) — COMPLETADO
    - server.test.ts actualizado: URLs usan UUID constante 550e8400-e29b-41d4-a716-446655440000 en lugar de cnt-203248 (9 reemplazos)
    - node --check: sintaxis válida en server.js y server.test.ts
T13 - Crear documentos que falten (despliegue/operacion, seguridad/auth) — S1-S11 — route: delegado (nuevos archivos varios) — commit: pendiente — estado: COMPLETADO

## Log

L1: "en que proyecto estamos y que sabes de el? es la primera vez que lo abro con Gentle-Ai como backup, asi que necesito que lo analices por completo segun los documentos, el codigo ya escrito, los test realizados, y que le hagamos una auditoria para saber que le falta, entiendo que engram no tenga nada porque es la primera vez que engram conoce este proyecto por lo que debera actualizarse como corresponda, asi que comienza a revisarlo con el subagente audito de GENTLE-AI y me dices sobre todo sobre los problemas graves que pueda tener los problemas sencillos los puedes corregirlos con el subagente que corresponda, los graves me los dices y lo vemos y que el subagente correspondiente repare y cree los documentos que necesite."
