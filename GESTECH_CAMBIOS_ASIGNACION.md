# GesTech — Cambio incremental: modelo de asignación de técnicos

**Este documento modifica `GESTECH_SPEC.md` y `GESTECH_CAMBIOS.md`.** Ante cualquier contradicción con esos archivos, **manda este documento**.

## Contexto

La versión anterior de RN-11 y RF10 definía la asignación de técnico de forma genérica: responsable obligatorio a partir de `APROBADO`, sin especificar quién asigna ni cómo. Se redefinió con un **modelo mixto** que distingue por tipo de servicio, más reglas explícitas de autoasignación, reasignación y baja de usuarios.

Si la tarea T-14 ya está implementada, esto **modifica** lo hecho. Si no, reemplaza su definición original.

---

## Tarea 1 — Actualizar `GESTECH_SPEC.md`

La spec es la fuente de verdad del proyecto. Antes de tocar código, aplicarle estos cambios para que quede sincronizada.

### 1.1 · Sección 2.1 (Usuario)

Reemplazar el bloque `DECISIÓN DE IMPLEMENTACIÓN — baja lógica de usuarios` **conservándolo**, y **agregar** debajo:

> **DECISIÓN DE IMPLEMENTACIÓN — baja de técnico con órdenes activas.** El sistema DEBE impedir la baja directa de un Técnico que figure como responsable de al menos una orden no terminal. En su lugar, DEBE ofrecer una reasignación masiva a otro técnico, con motivo obligatorio, y permitir la baja una vez completada. La reasignación masiva y la baja DEBEN ejecutarse en una única transacción: si falla la reasignación de alguna orden, no se da de baja al usuario. Cada orden genera su propio registro en `AsignacionTecnico` — no un registro agrupado — para que el historial por orden siga siendo completo.

### 1.2 · Sección 2.3 (OrdenTrabajo)

Reemplazar la fila `tecnicoResponsable` de la tabla:

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `tecnicoResponsable` | FK → Usuario | condicional | Obligatorio desde el alta en instalación y mantenimiento de cámaras. Nullable en servicio técnico hasta la autoasignación. **Obligatorio en los tres tipos antes de pasar a `PRESUPUESTADO`** |

### 1.3 · Sección 2.12 (Alerta)

Ampliar el enum `tipo`:

> `VENCIMIENTO_RETIRO` | `ORDEN_SIN_ASIGNAR`

### 1.4 · Sección 2.14 (AsignacionTecnico)

Agregar dos campos a la tabla:

| Campo | Tipo | Obligatorio |
|---|---|---|
| `motivo` | texto | condicional — obligatorio en reasignaciones |
| `tipoAsignacion` | enum: `INICIAL` \| `AUTOASIGNACION` \| `REASIGNACION` \| `REASIGNACION_POR_BAJA` | sí |

### 1.5 · Sección 3.1 (máquina de estados — servicio técnico)

En la fila `INGRESADO → PRESUPUESTADO`, agregar a la columna Disparador: *"Requiere técnico responsable asignado (RN-11)"*.

### 1.6 · Sección 3.3 (efectos colaterales)

Agregar a la fila `→ PRESUPUESTADO`: *"Validar que exista técnico responsable; rechazar la transición si no lo hay"*.

### 1.7 · Sección 4 (reglas de negocio)

Reemplazar **RN-11** completa:

> **RN-11 — Responsable de la orden de trabajo.** Toda orden de trabajo debe tener un técnico responsable asignado antes de pasar al estado "Presupuestado". En las órdenes de instalación y mantenimiento de cámaras, el técnico responsable se asigna al momento del registro de la solicitud, junto con la coordinación de la fecha de visita. En las órdenes de servicio técnico, la orden se registra sin responsable y un técnico puede autoasignarse cualquier orden que no tenga uno. La reasignación de una orden ya asignada solo puede ser realizada por el usuario Administrador, indicando el motivo. El sistema debe conservar el historial de cada asignación y reasignación.

### 1.8 · Sección 5 — RF03.1

Agregar a la lista de datos del registro de solicitud:

> - **Técnico responsable** — obligatorio únicamente para órdenes de instalación o mantenimiento de cámaras.

### 1.9 · Sección 5 — RF03.2

Agregar al final del requisito:

> El campo "Técnico que realizó la tarea" se autocompleta con el técnico responsable de la orden, permitiendo modificarlo si el trabajo fue ejecutado por otro técnico.

### 1.10 · Sección 5 — RF10

Reemplazar **RF10 completo** (los tres puntos actuales) por:

> - **RF10.1** — En las órdenes de instalación y mantenimiento de cámaras, el sistema debe permitir seleccionar el técnico responsable durante el registro de la solicitud, siendo este dato obligatorio.
> - **RF10.2** — En las órdenes de servicio técnico, el sistema debe permitir que un usuario Técnico se autoasigne como responsable de una orden que no tenga responsable asignado.
> - **RF10.3** — El sistema debe impedir el cambio de estado a "Presupuestado" si la orden no tiene un técnico responsable asignado.
> - **RF10.4** — La reasignación de una orden con responsable asignado solo puede ser realizada por el usuario Administrador, requiriendo el ingreso obligatorio de un motivo.
> - **RF10.5** — Cada asignación o reasignación debe registrarse indicando fecha, hora, técnico asignado, técnico anterior (si lo hubiera), usuario que realizó el cambio y motivo (en caso de reasignación).
> - **RF10.6** — El sistema debe mostrar en el panel principal la cantidad de órdenes de trabajo sin técnico responsable asignado.
> - **RF10.7** — El sistema debe impedir dar de baja a un usuario Técnico que tenga órdenes de trabajo activas asignadas, mostrando el listado de dichas órdenes y ofreciendo reasignarlas antes de continuar.
> - **RF10.8** — El sistema debe permitir reasignar en una única operación todas las órdenes activas de un técnico a otro técnico, requiriendo el ingreso de un motivo. Cada orden reasignada debe registrarse individualmente en el historial de asignaciones. Completada la reasignación, el sistema debe permitir dar de baja al usuario.

### 1.11 · Sección 5 — RF16

Agregar:

> - **RF16.6** — El sistema debe generar una alerta interna dirigida al Administrador cuando una orden de servicio técnico permanezca más de 7 días sin técnico responsable asignado.

### 1.12 · Sección 7 (matriz de permisos)

Reemplazar la fila *"Asignar/reasignar técnico"* por estas cuatro:

| Funcionalidad | Administrador | Técnico | Cliente |
|---|---|---|---|
| Asignar técnico al crear orden de cámaras | ✓ | ✓ | — |
| Autoasignarse una orden sin responsable | — | ✓ | — |
| Reasignar una orden ya asignada | ✓ | — | — |
| Reasignación masiva por baja de usuario | ✓ | — | — |

### 1.13 · Sección 8 — CU2

Agregar al paso 7 del Actor, dentro de la lista de datos del formulario: *"Técnico responsable (solo instalación y mantenimiento de cámaras)"*.

### 1.14 · Sección 8 — CU4, flujos alternativos

Reemplazar el flujo de asignación por:

> - **Autoasignación:** en órdenes de servicio técnico sin responsable, el actor puede autoasignarse. El sistema registra fecha, hora y usuario.
> - **Reasignación:** solo el Administrador puede reasignar una orden ya asignada, previo a su cumplimentación, ingresando el motivo. El sistema registra fecha, hora, técnico anterior y usuario responsable.

### 1.15 · Sección 8 — CU9

Agregar flujos alternativos:

> **8.1** Si el usuario a dar de baja es un técnico con órdenes activas asignadas, el sistema muestra el listado e informa que deben reasignarse antes de continuar.
> **8.2** El actor selecciona el técnico destino e ingresa el motivo de la reasignación.
> **8.3** El sistema reasigna todas las órdenes activas, registra cada una individualmente en el historial y continúa con la baja.

### 1.16 · Sección 10 (criterios de aceptación)

Agregar bajo "Órdenes e IDs":

- Crear una orden de cámaras sin técnico responsable es rechazado.
- Crear una orden de servicio técnico sin técnico responsable es aceptada.
- Pasar a `PRESUPUESTADO` una orden sin responsable es rechazado.
- Un Técnico que intenta reasignar una orden que ya tiene responsable recibe error de autorización.
- Un Técnico puede autoasignarse una orden sin responsable.
- Dar de baja a un Técnico con órdenes activas muestra el listado y no ejecuta la baja.
- Tras la reasignación masiva, la baja se completa y cada orden tiene su registro propio de tipo `REASIGNACION_POR_BAJA`.
- Si la reasignación masiva falla a mitad de camino, ni las órdenes cambian de responsable ni el usuario queda dado de baja.
- No se permite reasignar las órdenes al mismo técnico que se está dando de baja.

### 1.17 · Sección 12 (pendientes)

Agregar:

> **P-05 — Umbral de la alerta por orden sin asignar.** RF16.6 propone 7 días. Valor a confirmar con el equipo.
> **P-06 — Técnico destino de la reasignación masiva.** Se asume un único técnico destino para todas las órdenes. Confirmar si debe poder repartirse entre varios.

---

## Tarea 2 — Implementar en el código

### 2.1 · Modelo de datos `[BD]`

- `OrdenTrabajo.tecnicoResponsable` — nullable (si hoy es NOT NULL, migrar).
- `AsignacionTecnico` — agregar `motivo` (nullable) y `tipoAsignacion` (enum, NOT NULL).
- `Alerta.tipo` — agregar el valor `ORDEN_SIN_ASIGNAR`.

**Migración de datos existentes:** si ya hay registros en `AsignacionTecnico` sin `tipoAsignacion`, asignarles `INICIAL`.

### 2.2 · Alta de orden `[API]` `[UI]`

- **Cámaras:** selector de técnico responsable en el formulario, obligatorio. Listar solo técnicos activos.
- **Servicio técnico:** sin selector. La orden nace sin responsable.
- Validación en backend según `tipoServicio`, no solo en el formulario.

### 2.3 · Autoasignación `[API]` `[UI]`

- Acción "Tomar esta orden" en el listado y en el detalle, visible **solo** en órdenes de servicio técnico sin responsable.
- Al ejecutarse: setear `tecnicoResponsable` = usuario actual y registrar `AsignacionTecnico` con `tipoAsignacion = AUTOASIGNACION`.
- El backend DEBE rechazar la autoasignación si la orden ya tiene responsable, aunque la UI no muestre el botón (evita la condición de carrera de dos técnicos tomando la misma orden a la vez).

### 2.4 · Bloqueo de transición `[API]`

En la máquina de estados centralizada (T-02), rechazar el paso a `PRESUPUESTADO` si `tecnicoResponsable` es null. Mensaje: *"Debe asignarse un técnico responsable antes de presupuestar."*

### 2.5 · Reasignación `[API]` `[UI]`

- Restringida al rol Administrador. Verificar en backend.
- Motivo obligatorio, no vacío.
- Registrar `AsignacionTecnico` con `tecnicoAnterior`, `motivo` y `tipoAsignacion = REASIGNACION`.
- Disponible solo mientras la orden no esté cumplimentada.

### 2.6 · Baja de técnico con órdenes activas `[API]` `[UI]`

Flujo completo:

1. Al intentar la baja, el backend consulta órdenes no terminales donde el usuario sea responsable.
2. Si hay: devolver el listado y **no ejecutar la baja**.
3. La UI muestra el listado y pide técnico destino + motivo.
4. Al confirmar: en **una única transacción**, reasignar todas las órdenes (un registro de `AsignacionTecnico` por orden, `tipoAsignacion = REASIGNACION_POR_BAJA`) y dar de baja al usuario.
5. Si algo falla, revertir todo.

**Validaciones:** el técnico destino debe estar activo y ser distinto del que se da de baja.

### 2.7 · Contador de órdenes sin asignar `[API]` `[UI]`

Indicador en el panel principal con la cantidad de órdenes sin responsable, con acceso al listado filtrado. Visible para ambos roles.

### 2.8 · Alerta por orden sin asignar `[JOB]`

Extender el proceso diario existente (T-21): generar alerta `ORDEN_SIN_ASIGNAR` para órdenes de servicio técnico con más de 7 días sin responsable. Mismas condiciones de idempotencia que las alertas de vencimiento — no duplicar si ya existe una activa para esa orden. La alerta se resuelve automáticamente al asignarse un responsable.

### 2.9 · Cumplimentación `[UI]`

Autocompletar `tecnicoEjecutor` con `tecnicoResponsable`, dejándolo editable.

### 2.10 · Pruebas

Implementar los criterios del punto 1.16 como pruebas automatizadas. Prioridad a: la transacción de baja con reasignación (que revierta entera) y la condición de carrera en la autoasignación.

---

## Qué NO cambia

- La asignación **nunca es automática**. El sistema no elige técnico; siempre lo elige una persona.
- No se agregan roles nuevos. Siguen siendo Administrador, Técnico y Cliente.
- No se agregan campos de especialidad ni disponibilidad a `Usuario`.
- El resto de las tareas de `GESTECH_CAMBIOS.md` no se ve afectado.
