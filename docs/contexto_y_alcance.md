# CONTEXTO Y ALCANCE DEL SISTEMA

## 1. INTRODUCCIÓN Y PROBLEMÁTICA OPERATIVA

El sistema digitaliza la operativa de recepción, clasificación, conteo por lotes, captura de evidencias fotográficas y generación de manifiestos de carga (*Packing Lists*) para contenedores de neumáticos usados.

La operativa se desarrolla en patios industriales, campas y naves de almacenamiento logístico caracterizadas por:
- **Operarios multiculturales y multilingües:** Personal con diversidad idiomática (Español, Inglés, Ruso, Coreano y Chino Mandarín) y baja familiaridad tecnológica.
- **Condiciones físicas adversas:** Uso continuo de guantes de trabajo industriales, iluminación variable (desde luz solar directa de alta intensidad hasta naves con baja visibilidad) y polvo/suciedad.
- **Ausencia de conectividad (Offline-First Estricto):** Cobertura de red celular o Wi-Fi nula o intermitente en las zonas de carga de contenedores.

---

## 2. COMPONENTES DEL ECOSISTEMA

### 2.1 Terminal Móvil de Patio (Edge / Offline-First)
- **Interfaz Industrial:** Componentes táctiles con *touch targets* mínimos de $64 \times 64\text{ px}$, teclado numérico gigante y selectores ergonómicos en cascada de máximo 3 toques (Llanta $\to$ Ancho $\to$ Perfil), evitando cualquier entrada de texto libre durante el conteo.
- **Multilenguaje Visual Inmediato:** Selector de idioma en pantalla de inicio y persistencia de preferencia por operario.
- **Pipeline Fotográfico Edge:** Compresión nativa a WebP ($\le 150\text{ KB}$ y dimensión mayor $\le 1280\text{ px}$).
- **Persistencia Atómica:** Base de datos SQLite embebida en el dispositivo con transacciones inmediatas antes de reflejar el cambio en UI.
- **Compilador Local:** Generación en el propio móvil del manifiesto OpenXML (`.xlsx`) estandarizado y archivo `.zip` con firma criptográfica SHA-256.
- **Bóveda de Cuarentena:** Almacenamiento seguro local donde se aíslan los lotes cerrados e inmutables pendientes de validación.

### 2.2 Estación de Recepción y Validación (Configuración Flexible)
Desacoplada mediante el patrón repositorio (`IContenedorRepository`) con tres modos de despliegue conmutables:
1. **Modo 1 (Móvil Autónomo / P2P):** El supervisor cuenta con la app en su tablet o smartphone con SQLite local. Recibe el archivo de despacho vía Wi-Fi Direct, Bluetooth o transferencia de archivo y valida con un toque ("Validar con Tic").
2. **Modo 2 (PC On-Premise):** Servidor ligero en la oficina de la nave (Node.js/Fastify o Python/FastAPI) con base de datos local (SQLite o PostgreSQL local en Docker) y panel web de inspección de manifiestos y fotos.
3. **Modo 3 (Híbrido LAN):** Base de datos centralizada en el PC de la nave con acceso concurrente para visores móviles de supervisores conectados a la red Wi-Fi local de la nave.

### 2.3 Protocolo Transaccional Asíncrono (ACK Handshake en Dos Fases)
Para prevenir cualquier pérdida de información o fotos no respaldadas:
1. Al pulsar "Despachar", el terminal móvil del operario bloquea el lote (`BLOQUEADO_EN_BOVEDA`), lo oculta de la vista de trabajo y reinicia los contadores a cero para el siguiente lote.
2. **No se eliminan las fotos ni los registros locales** en ese instante.
3. El paquete se transfiere al receptor.
4. Cuando el receptor verifica el hash SHA-256 y el supervisor valida el lote, se emite un `ReceiptAckToken` criptográficamente firmado.
5. El terminal del operario recibe el token, verifica que `hash_ack == hash_local` y sólo entonces ejecuta la purga física de las imágenes locales, pasando el lote a estado `PURGADO`.
