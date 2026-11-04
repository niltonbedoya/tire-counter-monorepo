# ESTRATEGIA DE INTERNACIONALIZACIÓN (I18N) OFFLINE

## 1. PRINCIPIOS DE DISEÑO

- **100% Offline:** Todas las cadenas de texto residen en paquetes JSON embebidos en el bundle de la aplicación. Cero llamadas de red para resolver traducciones.
- **Namespaces Desacoplados:** Organización modular para facilitar el mantenimiento y la validación cruzada:
  - `auth`: Identificación táctil, PIN de 4 dígitos, cambio de usuario.
  - `counter`: Flujo en cascada (Llanta, Ancho, Perfil, Marca), botones de incremento (+1, +2, +5...), tabla de conteo.
  - `vault`: Contenedores activos, estado de bóveda, despacho, estado de cuarentena y confirmaciones.
  - `errors`: Mensajes de excepción tipados y advertencias al operario.
- **Idiomas Soportados:**
  - `es`: Español (idioma base canónico de referencia).
  - `en`: Inglés.
  - `ru`: Ruso.
  - `ko`: Coreano.
  - `zh`: Chino Mandarín.

---

## 2. REGLA DE PARIDAD DE DICCIONARIOS

El test unitario `test_i18n_dictionary_parity` exige que cualquier clave añadida o modificada en `es.json` debe reflejarse obligatoriamente en `en.json`, `ru.json`, `ko.json` y `zh.json`. Ningún bundle se aprueba si existe disparidad de claves o claves ausentes.

---

## 3. EXCEPCIÓN LOGÍSTICA: MANIFIESTO OPENXML (.XLSX)

Independientemente del idioma de la interfaz del operario (por ejemplo, si el conteo lo realiza un operario en ruso o coreano), la generación del manifiesto aduanero `.xlsx` se compila con encabezados y estructura en **Inglés** (o bilingüe Inglés/Español) para garantizar la interoperabilidad logística internacional en puertos y aduanas.
