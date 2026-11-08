# SEGURIDAD Y AUTENTICACIÓN DE COUNTER

Este documento recopila notas de seguridad y autenticación del monorepo **Counter**. Está dirigido a operadores, revisores de código y al equipo de auditoría del dominio (gatekeeper QA). Cubre cuatro hallazgos identificados durante la auditoría contra el SDD: el fin del bypass de contraseñas triviales en modo offline (F12a), el processor WebP simulado sin librería real (F12b), la exigencia de `SUPABASE_URL` por variable de entorno (F12c) y la recomendación de no commitear secretos.

---

## 1. FIN DEL BYPASS DE CONTRASEÑAS TRIVIALES EN MODO OFFLINE (F12a)

En modo offline el sistema no debe aceptar contraseñas triviales (por ejemplo `'1234'`, `'admin'`, `'password'`) como válidas para autenticar al operario ni para desbloquear el FSM del lote. Cualquier ruta de autenticación offline que haga fallback a una contraseña predeterminada debe eliminarse.

Comportamiento esperado:

```ts
// Rechazar contraseñas triviales sin consultar a Supabase
if (TRIVIAL_PASSWORDS.has(password)) {
  throw new Error('Trivial password rejected: use a real credential');
}
```

> **Riesgo:** autenticación. Un bypass de contraseña trivial permite acceso no autorizado al inventario y a los lotes en modo offline.

---

## 2. PROCESSOR WEBP SIMULADO SIN LIBRERÍA REAL (F12b)

El pipeline fotográfico Edge (`processor.ts`) genera evidencia fotográfica en formato WebP con lado mayor ≤ 1280 px y peso estricto < 153.600 bytes (150 KB). Actualmente la salida está **simulada**: no hay una librería WebP real detrás, por lo que las fotos generadas pueden no cumplir el formato ni el límite de peso exigidos por RF-05 y el bucket `fotos-evidencias` de Supabase.

Comportamiento esperado:

```ts
// Marcar explícitamente la salida como simulada, no WebP real
const evidence: EvidenciaFoto = {
  ...,
  formato: 'WebP',
  simulado: true,   // <-- sin librería WebP real
  pesoBytes: <tamaño real del archivo>,
};
```

> **Riesgo:** RF-05. Evidencias simuladas no verificables como WebP válidas pueden romper la ingesta en Supabase y el handshake ACK de despacho.

---

## 3. EXIGENCIA DE `SUPABASE_URL` POR VARIABLE DE ENTORNO (F12c)

El servidor de recepción (`apps/receptor-desktop/src/server.js`) no debe depender de una `SUPABASE_URL` hardcodeada como fallback. La URL de Supabase debe inyectarse obligatoriamente por variable de entorno; si falta, el servidor debe fallar al iniciar en lugar de usar un valor predeterminado.

Comportamiento esperado:

```js
const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}
```

> **Riesgo:** configuración y auth. Un fallback hardcodeado apunta a un proyecto Supabase ajeno y oculta errores de configuración en despliegue.

---

## 4. NO COMMITEAR SECRETOS

Nunca commitear claves, tokens, contraseñas ni valores reales de `SUPABASE_KEY` ni `SUPABASE_URL` en el repositorio.

- Use `.env.example` con marcadores de posición para documentar las variables requeridas.
- Mantenga los archivos `.env` fuera del control de versión (agregarlos a `.gitignore`).
- Rotar cualquier secreto que haya sido commiteado por error.

Ejemplo de entrada en `.gitignore`:

```
# Variables de entorno con secretos reales
.env
.env.local
*.env
```

---

## 5. CHECKLIST DE SEGURIDAD

- [ ] No hay contraseñas triviales aceptadas como fallback en modo offline.
- [ ] El processor WebP está marcado como simulado cuando no usa librería real.
- [ ] `SUPABASE_URL` es obligatoria por variable de entorno (sin fallback hardcodeado).
- [ ] Ningún secreto (`SUPABASE_KEY`, contraseñas, tokens) está commiteado.
- [ ] `.env` está incluido en `.gitignore`.

---

## 6. PRÓXIMO PASO

Revise `docs/despliegue_operacion.md` para los pasos de despliegue y operación (variables de entorno, levantar `apps/receptor-desktop`, construir workspaces, correr tests y nota sobre `dist/`).
