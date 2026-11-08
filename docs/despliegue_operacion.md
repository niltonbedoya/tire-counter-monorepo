# DESPLIEGUE Y OPERACIÓN DE COUNTER

Este documento explica cómo desplegar y operar el monorepo **Counter**: variables de entorno requeridas, cómo levantar la estación de recepción `apps/receptor-desktop`, cómo construir los workspaces y cómo ejecutar los tests. Está dirigido a operadores de despliegue y personal de soporte del sistema de clasificación, conteo y despacho de neumáticos.

---

## 1. VARIABLES DE ENTORNO REQUERIDAS

Antes de iniciar cualquier servicio, defina las siguientes variables de entorno. Puede copiar `apps/receptor-desktop/.env.example` a `apps/receptor-desktop/.env` y completar los valores reales.

| Variable | Descripción | Obligatoria | Ejemplo |
|----------|-------------|-------------|---------|
| `SUPABASE_URL` | URL del proyecto Supabase (nube). | Sí | `https://<PROJECT_ID>.supabase.co` |
| `SUPABASE_KEY` | Clave pública `anon` o `service_role` de Supabase. | Sí | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `PORT` | Puerto TCP del servidor de recepción. Por defecto `3000`. | No | `3000` |

Ejemplo de archivo de entorno (valores de marcador, no usarlos en producción):

```
SUPABASE_URL=https://mi-proyecto.supabase.co
SUPABASE_KEY=<clave-anon-o-service-role>
PORT=3000
```

> **Nota de seguridad:** `SUPABASE_URL` y `SUPABASE_KEY` deben inyectarse siempre por variable de entorno, nunca hardcodeadas en el código fuente. Consulte `docs/seguridad_y_auth.md`.

---

## 2. LEVANTAR `apps/receptor-desktop`

La estación de recepción es un servidor Fastify que expone los endpoints de validación, FSM, auth y navegación de la terminal de patio.

Desde la raíz del monorepo:

```bash
# 1. Instalar dependencias de todos los workspaces (una sola vez)
npm install

# 2. Crear el archivo de entorno con valores reales
cp apps/receptor-desktop/.env.example apps/receptor-desktop/.env
# Editar apps/receptor-desktop/.env con SUPABASE_URL y SUPABASE_KEY reales

# 3. Arrancar el servidor
npm run start --workspace=@tire-counter/receptor-desktop
# o equivalentemente:
cd apps/receptor-desktop && node src/server.js
```

El servidor escucha en `http://localhost:3000` (o el puerto definido en `PORT`) y responde:

```
[COUNTER SERVER] Servidor escuchando en http://localhost:3000
```

Para detenerlo, presione `Ctrl+C`.

---

## 3. CONSTRUIR LOS WORKSPACES

El monorepo usa npm workspaces (`packages/*`, `apps/*`, `tools/*`). Desde la raíz:

```bash
npm run build
```

Esto ejecuta el script `build` de cada workspace que lo defina. Por ejemplo, `apps/receptor-desktop` no tiene paso de compilación y solo imprime un aviso:

```
receptor-desktop: no build step
```

No hay artefactos de compilación obligatorios para ejecutar la aplicación; el servidor se corre directamente desde `src/`.

---

## 4. CORRER TESTS

Los tests se ejecutan con **vitest** por workspace. Desde la raíz del monorepo:

```bash
npm test
```

Esto corre `vitest run` en cada workspace que tenga tests:
- `@tire-counter/core-contracts`: 27 tests (FSM, agregador, esquemas, paridad repositorio, etc.)
- `@tire-counter/receptor-desktop`: 10 tests E2E HTTP API
- `@tire-counter/mcp-servers`: 6 tests de herramientas MCP de auditoría

Para correr solo los tests de un workspace:

```bash
npm run test --workspace=@tire-counter/receptor-desktop
```

---

## 5. NOTA: `dist/` PUEDE ESTAR DESINCRONIZADO CON `src/`

Algunos workspaces pueden generar salida en `dist/` durante la construcción. **No asuma que `dist/` refleja el estado actual de `src/`**:

- Si modificó `src/`, vuelva a ejecutar `npm run build` antes de desplegar.
- Si `dist/` existe pero no se regeneró tras un cambio en `src/`, el servicio puede ejecutar código obsoleto.
- Cuando haya dudas, limpie `dist/` y reconstruya:

```bash
rm -rf apps/receptor-desktop/dist packages/*/dist tools/*/dist
npm run build
```

---

## 6. DESPLIEGUE CON DOCKER & DOCKER COMPOSE EN VPS (PILOTO COREA)

Para el piloto internacional desatendido en VPS (~4GB RAM, ej. Hetzner):

### 6.1 Construcción y ejecución local/remota con Docker

```bash
# Construir imagen de producción
docker build -t counter-receptor:latest .

# Ejecutar contenedor
docker run -d \
  --name counter-receptor \
  -p 3000:3000 \
  --env-file apps/receptor-desktop/.env \
  counter-receptor:latest
```

### 6.2 Despliegue con Docker Compose y Cloudflare Tunnel

1. Configurar variables en `apps/receptor-desktop/.env`:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `PORT=3000`
   - `CLOUDFLARE_TUNNEL_TOKEN=<token_de_cloudflare>`

2. Levantar el servicio receptor:
```bash
docker compose up -d receptor-desktop
```

3. (Opcional) Levantar con el túnel Cloudflare integrado para exponer a `services-nba.com`:
```bash
docker compose --profile tunnel up -d
```

---

## 7. CHECKLIST DE DESPLIEGUE

- [ ] `SUPABASE_URL`, `SUPABASE_KEY` definidas como variables de entorno (no hardcodeadas).
- [ ] `PORT` definido o se acepta el valor por defecto `3000`.
- [ ] `apps/receptor-desktop/.env` creado a partir de `.env.example` con valores reales.
- [ ] Dependencias instaladas: `npm install` en la raíz.
- [ ] Workspaces construidos: `npm run build`.
- [ ] Tests ejecutados y verdes: `npm test` (43/43 tests pasando).
- [ ] `dist/` sincronizado con `src/` tras cualquier cambio de código.
- [ ] Servidor levantado y responde en `http://localhost:<PORT>`.
- [ ] (Producción) Docker / Docker Compose operativo en VPS con túnel Cloudflare hacia `services-nba.com`.

---

## 7. PRÓXIMO PASO

Revise `docs/seguridad_y_auth.md` para las notas de seguridad y autenticación aplicables al despliegue (bypass de contraseñas triviales, WebP simulado, exigencia de `SUPABASE_URL` por env var y manejo de secretos).
