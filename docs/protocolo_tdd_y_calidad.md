# PROTOCOLO TDD Y GESTIÓN DE CALIDAD

## 1. PRINCIPIO FUNDAMENTAL (RED-GREEN-REFACTOR)

Queda estrictamente prohibido escribir código de producción sin una especificación formal y un test unitario o de integración previo que falle de forma determinista (Fase RED).

```
  ┌──────────────┐       ┌───────────────┐       ┌────────────────┐
  │   FASE RED   │  ──>  │  FASE GREEN   │  ──>  │ FASE REFACTOR  │
  │ Test fallido │       │ Código mínimo │       │ Optimización y │
  │ reproducible │       │ que pasa test │       │ limpieza limpia│
  └──────────────┘       └───────────────┘       └────────────────┘
```

---

## 2. BATERÍA OBLIGATORIA DE TESTS DEL SISTEMA

1. **`test_aggregator_consolidation_single_line`**
   - **Objetivo:** Enviar múltiples deltas (`+2`, `+5`, `-1`) para la misma medida (`205/55R16`).
   - **Criterio de Aceptación:** La base de datos y la colección en memoria contienen exactamente una fila consolidada con `cantidad = 6`.

2. **`test_aggregator_mark_module_toggle`**
   - **Objetivo:** Comprobar el comportamiento al alternar el módulo de marcas.
   - **Criterio de Aceptación:** Si `modulo_marca_activo = false`, la clave compuesta asigna `GENERICA` y agrupa sin importar marcas previas.

3. **`test_i18n_dictionary_parity`**
   - **Objetivo:** Verificar la integridad de los diccionarios de internacionalización.
   - **Criterio de Aceptación:** El 100% de las claves definidas en `es.json` deben existir sin excepción en `en.json`, `ru.json`, `ko.json` y `zh.json`.

4. **`test_processor_compression_and_dimensions`**
   - **Objetivo:** Pipeline de imagen edge bajo estrés.
   - **Criterio de Aceptación:** Al ingresar un buffer simulado de alta resolución (3840x2160 px, ~6 MB), el artefacto final debe ser WebP, con dimensión mayor $\le 1280\text{ px}$ y peso en bytes $< 153.600$ ($150\text{ KB}$).

5. **`test_list_packer_openxml_exact_sum_and_lang`**
   - **Objetivo:** Generación y estandarización de manifiestos OpenXML.
   - **Criterio de Aceptación:** Lote de 15 medidas distintas con 1.450 neumáticos creado bajo idioma ruso. El `.xlsx` resultante debe tener encabezados en inglés y la suma matemática exacta de celdas de cantidad debe ser `1450`.

6. **`test_dispatch_coordinator_ack_handshake_success`**
   - **Objetivo:** Flujo positivo de handshake de despacho y purga.
   - **Criterio de Aceptación:** Con un paquete de hash `H1` y un `ReceiptAckToken` válido con hash `H1`, el contenedor transiciona a `PURGADO` y las fotos locales WebP son eliminadas del sistema de archivos.

7. **`test_dispatch_coordinator_ack_rejection_on_mismatch`**
   - **Objetivo:** Seguridad ante discrepancia o manipulación de hash en despacho.
   - **Criterio de Aceptación:** Con un paquete de hash `H1` y un `ReceiptAckToken` con hash modificado `H2`, se emite una excepción de seguridad, se aborta la purga y se preservan todos los archivos en la bóveda de cuarentena.

8. **`test_fsm_immutability_post_dispatch`**
   - **Objetivo:** Inmutabilidad de datos en contenedores despachados o en bóveda.
   - **Criterio de Aceptación:** Cualquier invocación al `aggregator` o intento de mutación sobre un contenedor en estado `BLOQUEADO_EN_BOVEDA`, `DESPACHADO_PENDIENTE_ACK`, `CONFIRMADO_EN_DESTINO` o `PURGADO` debe ser rechazada con un error tipado de FSM.

9. **`test_repository_adapter_parity`**
   - **Objetivo:** Paridad funcional entre adaptadores del patrón repositorio.
   - **Criterio de Aceptación:** Ejecución idéntica de la suite de operaciones CRUD y transacciones sobre `SQLiteLocalAdapter` y sobre `HttpLanClientAdapter`.
