# GesTech — Plan de implementación Rev. 5.0

Documento operativo. Define **qué cambiar en el código existente** y **en qué orden**. La especificación completa del comportamiento está en `GESTECH_SPEC.md`; este archivo no la repite, la referencia.

## Antes de empezar

1. **Leer `GESTECH_SPEC.md` completo.** Este plan no es autosuficiente.
2. **Relevar el código existente** antes de escribir nada: qué entidades ya existen, qué se llama distinto, qué está a medio hacer. Varias tareas dicen "agregar", pero si el campo ya existe con otro nombre, se reutiliza.
3. **Revisar la sección 12 de la spec** (los 4 pendientes). Si alguno bloquea una tarea, preguntar antes de asumir.
4. **Trabajar por fases, en orden.** Las fases posteriores dependen de las anteriores. Dentro de una fase, las tareas pueden hacerse en paralelo.
5. **No refactorizar lo que funciona.** El objetivo es aplicar estos cambios, no reescribir el sistema.

## Convenciones

- `[BD]` requiere migración de base de datos.
- `[API]` requiere endpoint nuevo o modificado.
- `[UI]` requiere pantalla nueva o modificada.
- `[JOB]` requiere proceso programado.
- Los nombres de campos son los de la spec; adaptarlos a las convenciones del proyecto.

---

## Fase 0 — Fundaciones

Todo lo demás depende de esto. Hacer primero y completo.

### T-01 · Auditoría `[BD]` `[API]`
Crear las cuatro entidades de auditoría: `HistorialEstado`, `AsignacionTecnico`, `MovimientoStock`, `RegistroAuditoria` (spec 2.14).

- Solo inserción. **No** exponer endpoints de UPDATE ni DELETE.
- Endpoint de consulta restringido al Administrador.
- Enganchar la escritura en `HistorialEstado` a **todo** cambio de estado, incluidos los automáticos (`usuario = null`, `automatico = true`).

> Hacer esto primero permite que el resto de las tareas escriban auditoría desde el inicio, en vez de tener que volver a instrumentar cada flujo después.

### T-02 · Máquina de estados centralizada `[API]`
Extraer la lógica de transiciones a un único punto que valide contra las tablas de la spec 3.1 y 3.2.

- Toda transición no listada se rechaza con error explícito.
- Agregar el estado `ANULADO` a ambos conjuntos.
- Los efectos colaterales (spec 3.3) se disparan desde acá, en la misma transacción.
- Si hoy los cambios de estado están dispersos, centralizarlos: es la precondición para C-06, C-07, C-08 y C-14.

### T-03 · Verificación de permisos en backend `[API]`
Implementar la matriz de la spec 7 en cada endpoint. Ocultar botones en la UI no es control de acceso.

### T-04 · ID de orden correlativo y atómico `[BD]`
Revisar cómo se genera hoy. Si usa `MAX + 1` en código de aplicación, reemplazar por un mecanismo atómico de base de datos (spec 2.3.1). El contador nunca retrocede.

---

## Fase 1 — Correcciones menores

Cambios acotados, sin dependencias entre sí. Rápidos de cerrar.

### T-05 · C-01 · Campo "Equipo" condicional `[API]` `[UI]`
`equipo` obligatorio **solo** si `tipoServicio = SERVICIO_TECNICO`. Agregar `cantidadCamaras`, obligatorio para instalación y mantenimiento. Ajustar validación y formulario.

### T-06 · C-02 · Bug de numeración en CU9 `[UI]`
Corregir el salto del flujo de baja de usuario: *"si confirma, ir a paso 10"*, no al 9. Verificar que la confirmación de baja no genere un bucle.

### T-07 · C-03 · Validación de método de pago `[API]`
Restringir `metodoPago` al enum de RN-01: transferencia, tarjeta de crédito, tarjeta de débito, efectivo. Validar en backend.

### T-08 · C-08 (parcial) · Corrección de RF03.1.1 `[UI]`
Cambiar el texto del requisito y de cualquier mensaje de interfaz: los IDs no se reutilizan "incluso si una orden es anulada" (antes decía "eliminada").

### T-09 · C-10 · Verificación de cliente existente `[API]` `[UI]`
Endpoint de búsqueda de cliente por DNI o teléfono. Modificar el alta de solicitud (CU2): primero pedir DNI/teléfono, autocompletar si existe, mostrar alta completa si no.

Incluir la normalización de teléfono de la spec 2.2. **Si ya hay clientes cargados con formatos mixtos, migrarlos**, o el Chatbot no los va a encontrar.

---

## Fase 2 — Stock y presupuestos

Bloque cohesivo. C-09 y C-11 tocan las mismas entidades; conviene hacerlos juntos.

### T-10 · Modelo de stock `[BD]`
- Agregar `stockReservado` a `Producto` (default 0).
- Agregar `precio` si no existe (RF07.1 lo pide pero el diagrama de clases no lo tenía).
- Exponer `stockDisponible` como valor derivado, no como columna.
- Baja lógica de productos (`activo`), impidiendo dar de baja con `stockReservado > 0`.

### T-11 · C-09 · Presupuesto con productos `[BD]` `[API]` `[UI]`
- Crear `DetallePresupuesto` (spec 2.5) con `precioUnitario` congelado.
- Agregar a `Presupuesto`: `subtotalMateriales`, `montoManoObra`, `montoTotal`, `estado`, `fechaRespuestaCliente`.
- Formulario de presupuesto dentro de CU4: en cámaras muestra productos con stock disponible y precio; calcula subtotales en vivo; mano de obra manual; total automático.
- En servicio técnico: sin productos, `subtotalMateriales = 0`.
- Backend recalcula y valida todos los montos; no confía en el frontend.
- Validar disponibilidad antes de guardar (RF11.3).

### T-12 · Reserva, descuento y liberación de stock `[API]`
Implementar las tres operaciones con transacciones atómicas (spec RF11.4, RF11.5 y la decisión de concurrencia):

| Evento | Operación |
|---|---|
| Presupuesto aprobado (cámaras) | `stockReservado += cantidad` |
| Orden finalizada | `stock -= cantidad`, `stockReservado -= cantidad` |
| Orden rechazada o anulada | `stockReservado -= cantidad` |

Cada operación escribe en `MovimientoStock`.

### T-13 · C-11 · Reposición de stock `[BD]` `[API]` `[UI]`
Crear `ReposicionStock` y `DetalleReposicion` (spec 2.10 y 2.11). CU12 completo, incluyendo recepciones parciales. Proveedor es **texto libre**, no entidad. Solo Administrador.

Conectar con RF12.4: al detectar stock insuficiente durante el presupuesto, ofrecer registrar el pedido.

---

## Fase 3 — Órdenes y responsables

### T-14 · C-06 · Técnico responsable `[BD]` `[API]` `[UI]`
- Agregar `tecnicoResponsable` a `OrdenTrabajo` (la relación **no existe** hoy en el modelo).
- Exigirlo a partir de `APROBADO` (RN-11).
- Permitir asignar y reasignar antes de la cumplimentación.
- Cada asignación escribe en `AsignacionTecnico`, con técnico anterior y usuario responsable.

> **Actualizado por `GESTECH_CAMBIOS_ASIGNACION.md`** — el modelo de asignación descrito arriba (responsable obligatorio genérico desde `APROBADO`, sin distinción de quién asigna) queda reemplazado por el modelo mixto de ese documento (autoasignación en servicio técnico, asignación obligatoria al alta en cámaras, reasignación exclusiva del Administrador, bloqueo de baja de técnicos con órdenes activas). Ver ese archivo para la definición vigente de T-14.

### T-15 · C-08 · Anulación de órdenes `[BD]` `[API]` `[UI]`
- Agregar `motivoAnulacion` y `fechaAnulacion` a `OrdenTrabajo`.
- CU15 completo (spec 8). Solo Administrador.
- Impedir anular órdenes cumplimentadas.
- Liberar reservas de stock al anular.
- Bloquear la orden anulada para toda modificación.
- Escribir en `RegistroAuditoria`.

### T-16 · C-04 · Cierre de órdenes rechazadas `[API]` `[UI]`
Ajustar RF08: distinguir cumplimentadas de cerradas por rechazo. Excluir anuladas del cálculo, con listado separado.

### T-17 · C-05 · Reclamo de garantía `[BD]` `[API]` `[UI]`
- Crear `ReclamoGarantia` (spec 2.13) y `Garantia` si no existe.
- Agregar `ordenOriginal` y `bajoGarantia` a `OrdenTrabajo`.
- CU14 completo: validar plazo vigente (RN-05), coincidencia de falla (RN-06) y ausencia de causales (RN-07).
- La orden generada recorre el flujo normal, sin presupuesto, con `montoCobrado = 0`.
- Excluir de ingresos en RF08 pero contar como trabajo realizado.

---

## Fase 4 — Chatbot y automatización

### T-18 · Registro de conversaciones `[BD]` `[API]`
Crear `ConversacionChatbot` (spec 2.15). Registrar **todo** mensaje entrante y saliente. Es la base de T-19 y T-21.

### T-19 · C-13 · Consulta de conversaciones `[API]` `[UI]`
CU13: listado por cliente y orden, con detalle. Solo Administrador, **solo lectura**.

### T-20 · C-12 · Consulta de estado vía Chatbot `[API]`
- Agregar `subEstado` a `OrdenTrabajo`, válido solo en `EN_PROCESO`, limpiándose al salir.
- CU11 completo: identificar por teléfono, pedir ID si hay varias activas, responder estado y sub-estado.
- **Validar que la orden pertenezca al teléfono consultante** (RF13.1.2). Sin esto, cualquiera consulta órdenes ajenas probando IDs.

### T-21 · C-07 · Alertas de vencimiento `[BD]` `[API]` `[UI]` `[JOB]`
- Crear `Alerta` (spec 2.12).
- Agregar `fechaNotificacionRetiro` a `OrdenTrabajo`, seteada al pasar a `PENDIENTE_DE_RETIRO`.
- Proceso diario **idempotente y recuperable** (spec RF05.5).
- Día 80: recordatorio al cliente + alerta interna al Administrador.
- Día 90: estado `ABANDONADO` + mensaje final al cliente + alerta resuelta.
- Panel de alertas del Administrador, con marcar como vista.
- **Solo servicio técnico.**

> **Ampliado por `GESTECH_CAMBIOS_ASIGNACION.md`** — el mismo proceso diario extiende la generación de alertas a `ORDEN_SIN_ASIGNAR` (órdenes de servicio técnico con más de 7 días sin técnico responsable). Ver ese archivo, punto 2.8.

### T-22 · Envío asíncrono de mensajes `[API]`
Si hoy el envío por WhatsApp es sincrónico dentro de la transacción, desacoplarlo (spec 3.3). Un cambio de estado no debe fallar ni perderse porque la API de WhatsApp esté caída.

---

## Fase 5 — Cierre

### T-23 · Consulta de auditoría `[UI]`
Pantalla del Administrador para consultar el historial: cambios de estado, asignaciones, movimientos de stock y anulaciones, filtrable por orden y por período.

### T-24 · Pruebas
Implementar los criterios de aceptación de la spec 10 como pruebas automatizadas. Prioridad a los casos de concurrencia (IDs y stock), permisos e idempotencia del proceso diario: son los que fallan de forma silenciosa.

---

## Mapa de dependencias

```
Fase 0 (T-01…T-04)  — base de todo
   ├── Fase 1 (T-05…T-09)      independientes entre sí
   ├── Fase 2 (T-10…T-13)      T-10 → T-11 → T-12 → T-13
   ├── Fase 3 (T-14…T-17)      requiere T-02; T-15 requiere T-12
   ├── Fase 4 (T-18…T-22)      T-18 → T-19; T-21 requiere T-02
          └── Fase 5 (T-23, T-24)
```

## Fuera de alcance

No implementar, aunque parezca razonable: código QR por orden · proveedor como actor con acceso · multi-sucursal, multi-depósito o ubicaciones de stock · cuenta corriente, señas o pagos parciales · portal web o login para clientes · roles distintos de Administrador y Técnico · SLA, contratos de mantenimiento o abonos · facturación electrónica AFIP/ARCA · app móvil · notificaciones por email o SMS.

Si alguna de estas aparece como necesaria durante la implementación, **preguntar antes**: fueron descartadas de forma deliberada.
