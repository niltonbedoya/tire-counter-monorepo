# REQUISITOS DEL SISTEMA (RF Y RNF)

## 1. REQUISITOS FUNCIONALES (RF)

### RF-01: Autenticación Industrial & Selección i18n
- Selector de idioma en pantalla principal accesible con banderas/códigos (`es`, `en`, `ru`, `ko`, `zh`).
- Tarjetas táctiles grandes para selección de operarios.
- Teclado numérico gigante en pantalla para ingreso de PIN de 4 dígitos (sin teclado de sistema).
- Carga reactiva inmediata del perfil de idioma del operario seleccionado.

### RF-02: Gestión Multicontenedor Paralelo
- Capacidad de gestionar y alternar entre múltiples contenedores concurrentes con un toque.
- Guardado atómico e independiente por contenedor sin colisión de transacciones.

### RF-03: Selector Ergonómico Secuencial en Cascada
- Flujo de 3 toques obligatorios: **Llanta** (orden numérico) $\to$ **Ancho** $\to$ **Perfil**.
- Cero cuadros de texto libre durante el ciclo de conteo.
- Módulo de Marca opcional y desactivable globalmente desde la configuración técnica.

### RF-04: Conteo Rápido y Consolidación Atómica
- Modificadores directos de adición de alta frecuencia: `+1`, `+2`, `+4`, `+5`, `+10`.
- Teclado numérico auxiliar para inserción directa de cantidades arbitrarias.
- Consolidación instantánea en base de datos por `claveCompuesta`.
- Ajustes en vivo (`+1` / `-1`) directamente sobre cada fila del resumen activo.

### RF-05: Pipeline Fotográfico Edge
- Módulo de cámara integrado con captura instantánea de pilas de ruedas.
- Redimensionamiento automático al vuelo garantizando que el lado mayor sea $\le 1280\text{ px}$.
- Codificación WebP con factor de calidad 65%.
- Peso estricto por fotografía $< 150\text{ KB}$ ($153.600\text{ bytes}$).
- Cálculo inmediato de checksum SHA-256 local.

### RF-06: Compilador de Manifiesto Estandarizado (Packing List)
- Generación local de archivo OpenXML (`.xlsx`) editable con formato profesional.
- Encabezado con metadatos del lote (código, fecha, operario, cantidad total).
- Filas agrupadas y ordenadas por Llanta ascendente y Medida.
- **Regla Aduanera Internacional:** Encabezados y títulos en inglés (o bilingüe inglés/español) independientemente del idioma que el operario tenga activo en pantalla.
- Empaquetado en un archivo `.zip` que contiene el `.xlsx` y las fotos WebP.
- Firma criptográfica SHA-256 del archivo `.zip` completo.

### RF-07: Aislamiento en Bóveda de Cuarentena
- Al accionar el botón de despacho, el lote transiciona inmediatamente a `BLOQUEADO_EN_BOVEDA`.
- La pantalla de trabajo del operario se limpia y se reinicia a cero de forma atómica.
- El archivo de despacho queda en cuarentena inmutable en el almacenamiento local protegido.

### RF-08: Patrón Repositorio y Despliegue Configurable
- Desacoplamiento mediante interfaz `IContenedorRepository`.
- **Modo Móvil Autónomo:** Ingesta directa en app receptora o compartición directa del ZIP.
- **Modo PC Local:** Envío HTTP a servidor Fastify/FastAPI local en la red Wi-Fi o arrastre manual en interfaz web.
- **Modo Híbrido LAN:** Lectura y escritura sincronizada en LAN.

### RF-09: Protocolo de Handshake ACK y Purga Garantizada
- La estación receptora verifica el hash SHA-256 del paquete recibido.
- El supervisor revisa el manifiesto y valida con un toque ("Validar con Tic").
- Se genera un token criptográfico `ReceiptAckToken`.
- El terminal móvil del operario compara `hash_ack == hash_local`.
- Si coinciden, se purgan físicamente las imágenes locales WebP liberando almacenamiento y el estado pasa a `PURGADO`.
- Si no coinciden, se cancela la purga y se preservan todos los archivos en la bóveda con alerta de auditoría.

### RF-10: Motor de Localización Desacoplado
- Prohibición estricta de cadenas de texto hardcodeadas en componentes UI.
- Catálogo de diccionarios JSON organizados en namespaces (`auth`, `counter`, `vault`, `errors`).
- Cero dependencias de servicios de traducción remotos (100% offline).
- Soporte tipográfico para glifos latinos, cirílicos, hangul y CJK sin truncamiento visual.

---

## 2. REQUISITOS NO FUNCIONALES (RNF)

- **RNF-01 (Offline-First Absoluto):** La aplicación no debe requerir conexión a internet en ningún momento para autenticar operarios, contar neumáticos, tomar y comprimir fotos, cambiar de idioma o generar el manifiesto `.zip`.
- **RNF-02 (Ergonomía Industrial en Planta):** Touch targets mínimos de $64 \times 64\text{ px}$. Tipografía numérica sobredimensionada legible a 1,5 metros de distancia bajo luz solar intensa o naves con iluminación precaria.
- **RNF-03 (Tolerancia a Fallos y Atomicidad):** Cada suma o resta de inventario se confirma en la base de datos SQLite antes de actualizar el estado en pantalla. Cero pérdida de conteo ante apagado repentino del dispositivo o cierre forzado.
- **RNF-04 (Huella de Almacenamiento Acotada):** Un lote estándar de 2.000 neumáticos con 20 fotografías de evidencia no debe superar 4 MB de almacenamiento físico en el terminal.
