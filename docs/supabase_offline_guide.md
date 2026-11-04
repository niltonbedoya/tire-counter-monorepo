# GUÍA DE ARQUITECTURA E INTEGRACIÓN SUPABASE & OFFLINE-FIRST

Este documento detalla la estrategia de transición para operar **Counter** conectado a la nube mediante **Supabase**, garantizando **tolerancia 100% offline** en la terminal móvil del operario cuando trabaja en almacenes o zonas sin cobertura.

---

## 1. ¿POR QUÉ SUPABASE ES LA MEJOR ELECCIÓN PARA COUNTER?

1. **PostgreSQL con Row Level Security (RLS) nativo:**
   Permite aplicar a nivel de base de datos la separación estricta entre el rol `operario` (que solo puede registrar ruedas en sus lotes activos) y el rol `admin` (que aprueba con "Tic", consulta el inventario central y audita).
2. **Postgres Functions & Triggers para FSM:**
   Garantiza la inmutabilidad de los lotes bloqueados (`BLOQUEADO_EN_BOVEDA`) y el cómputo atómico del inventario sin riesgo de condiciones de carrera ni duplicidad de conteos.
3. **Storage Integrado con Cuota Estricta:**
   El bucket `fotos-evidencias` valida a nivel de motor el límite estricto de **150 KB (153.600 bytes)** y formato exclusivo **WebP**.
4. **Sincronización en Tiempo Real:**
   Las suscripciones Supabase Realtime permiten que la pantalla de **Admin** en PC reciba las actualizaciones de nuevos despachos o entradas al almacén de forma instantánea en cuanto el terminal móvil recupere conectividad.

---

## 2. ARQUITECTURA OFFLINE-FIRST (PATRÓN LOCAL-OUTBOX)

En almacenes de neumáticos, la cobertura suele ser intermitente o nula. Por ello, la aplicación móvil **nunca bloquea la interacción del usuario esperando una respuesta de red**.

```
  ┌──────────────────────────────────────────────────────────────┐
  │                 TERMINAL MÓVIL (OPERARIO)                   │
  │                                                              │
  │  [ UI Rápida ] ──> [ SQLite Local / IndexedDB ]              │
  │                             │                                │
  │                             ▼                                │
  │                    [ Tabla: sync_outbox ]                    │
  │                             │                                │
  └─────────────────────────────┼────────────────────────────────┘
                                │
                      ¿Hay Red? │ (Background Sync Worker)
                                ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                    SUPABASE (CLOUD POSTGRES)                 │
  │                                                              │
  │  • Auth & RLS (Roles: operario / admin)                      │
  │  • Tablas: lotes, items_lote, inventario_maestro             │
  │  • Bucket: fotos-evidencias (WebP < 150 KB)                  │
  │  • Procedimiento Atómico: confirmar_lote_y_actualizar_inv()  │
  └──────────────────────────────────────────────────────────────┘
```

### Principios de Sincronización:
1. **Escritura Local Inmediata:** Toda adición de rueda, lote o foto se persiste primero en la base de datos local SQLite con estado de sincronización `pending`.
2. **Cola de Despacho (Outbox Pattern):** Los eventos generados en local se registran con marcas de tiempo monotónicas y hashes SHA-256 locales.
3. **Sincronización Reactiva (Background Worker):** Cuando `navigator.onLine` o el detector de red móvil emite conectividad, el worker vacía la cola por lotes hacia Supabase mediante endpoints transaccionales o RPCs.
4. **Resolución de Conflictos:**
   - La granularidad de los ítems es por `(lote_id, clave_compuesta)`. 
   - Las operaciones de incremento son conmutativas (`ON CONFLICT (lote_id, clave_compuesta) DO UPDATE SET cantidad = cantidad + EXCLUDED.cantidad`).
   - Si el lote ya fue bloqueado o despachado, el trigger PostgreSQL rechaza cualquier modificación fuera de regla.

---

## 3. PASO A PASO: CONFIGURACIÓN DEL PROYECTO EN SUPABASE

### Paso 1: Crear el Proyecto en Supabase
1. Accede a [https://supabase.com/dashboard](https://supabase.com/dashboard) e inicia sesión.
2. Pulsa en **"New Project"**.
3. Completa los datos:
   - **Name:** `Counter-Inventory`
   - **Database Password:** Genera una contraseña segura y guárdala.
   - **Region:** Selecciona la región geográfica más cercana a tu almacén (ej. *EU (Frankfurt)* o *EU (London)*).
4. Espera aprox. 1-2 minutos a que el cluster de PostgreSQL termine de inicializarse.

### Paso 2: Ejecutar el Esquema SQL
1. En el menú lateral izquierdo de Supabase, haz clic en **"SQL Editor"** (icono de terminal `>_`).
2. Pulsa en **"New query"**.
3. Abre el archivo local [supabase_schema.sql](file:///d:/PersonalAIFolder/Counter/docs/supabase_schema.sql) del repositorio, copia todo su contenido y pégalo en el editor de Supabase.
4. Pulsa el botón verde **"Run"** (o `Ctrl+Enter`).
5. Verifica que el resultado devuelva `Success. No rows returned` y no arroje errores de sintaxis.

### Paso 3: Verificar Tablas y Políticas RLS
1. Ve a **"Table Editor"** en el panel izquierdo.
2. Comprueba que existan las 7 tablas:
   - `perfiles_usuarios`
   - `lotes`
   - `items_lote`
   - `inventario_maestro`
   - `movimientos_inventario`
   - `fotos_evidencia`
   - `registro_auditoria`
3. En **"Authentication"** $\to$ **"Policies"**, constata que todas las tablas tengan activado el candado verde de **RLS (Row Level Security)**.

### Paso 4: Crear los Primeros Usuarios (Admin y Operario)
1. Ve a **"Authentication"** $\to$ **"Users"** $\to$ **"Add user"** $\to$ **"Create user"**.
2. **Usuario Administrador:**
   - Email: `admin@counter.local` (o tu correo real)
   - Password: Tu clave segura
   - En *User Metadata* (JSON):
     ```json
     { "nombre": "Supervisor Principal", "rol": "admin" }
     ```
3. **Usuario Operario:**
   - Email: `operario1@counter.local`
   - Password: Tu clave segura
   - En *User Metadata* (JSON):
     ```json
     { "nombre": "Operario Almacén 1", "rol": "operario" }
     ```

---

## 4. VARIABLES DE ENTORNO PARA LAS APLICACIONES

En la raíz del proyecto o en `apps/mobile/.env` y `apps/receptor-desktop/.env`:

```env
# Supabase API Configuration
SUPABASE_URL=https://<TU-PROJECT-ID>.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...<TU-ANON-KEY-PUBLICA>

# Modo de Operación
COUNTER_OFFLINE_STORAGE=sqlite
COUNTER_SYNC_STRATEGY=outbox
```

Las claves se obtienen en el panel de Supabase: **Project Settings** $\to$ **API** $\to$ **Project URL** y **Project API Keys (`anon public`)**.

---

## 5. FLUJO DE TRABAJO DIARIO ENTRE OPERARIO Y ADMIN

1. **Operario en la Nave (Móvil / PWA / Tablet):**
   - Inicia sesión. Si no hay internet, valida contra la sesión en caché local.
   - Pulsa **"Entrada Almacén"** o **"Nuevo Packing List (Despacho)"**.
   - Agrega medidas mediante los botones táctiles: `Ancho` $\to$ `Perfil` $\to$ `Llanta` $\to$ `Marca`.
   - Si no hay red, todo se guarda en el SQLite local.
   - Al terminar, pulsa **"Despachar Lote"** / **"Cerrar Entrada"**. El lote queda bloqueado localmente.
2. **Sincronización:**
   - Cuando el dispositivo detecta WiFi o datos, la cola `sync_outbox` sube el lote, los ítems y las fotos WebP a Supabase.
3. **Admin (Receptor / PC):**
   - En la pestaña `🖥️ Admin`, ve la lista de lotes entrantes.
   - Pulsa `👁️ Ver` para inspeccionar el desglose de medidas o `✓ Tic` para confirmar.
   - La función `confirmar_lote_y_actualizar_inventario()` ejecuta la transacción en Postgres, incrementando o decrementando el `inventario_maestro` de forma segura.
   - El operario recibe el token criptográfico `ReceiptAckToken` y su app purga las fotos locales.
