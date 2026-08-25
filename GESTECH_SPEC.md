# GesTech — Especificación funcional para implementación (Rev. 5.0)

Documento **autocontenido**. No requiere consultar la Rev. 4.0: todo el comportamiento del sistema está definido aquí, incluyendo lo que ya existía y lo que se agrega o corrige en esta revisión.

## Cómo usar este documento

Está escrito para ser implementado directamente. Reglas de lectura:

- **MUST / DEBE** = obligatorio, no negociable.
- **Los identificadores** (`RF01`, `RN-01`, `CU1`) son trazabilidad al documento académico. Se conservan para poder justificar cada decisión ante la cátedra.
- **Los bloques `DECISIÓN DE IMPLEMENTACIÓN`** marcan puntos donde el documento original era ambiguo y aquí se resuelve. Si el código existente ya resolvió ese punto de otra forma y funciona, respetar lo existente y avisar; no reescribir por gusto.
- **Los bloques `PENDIENTE`** marcan lo único que NO está definido y que hay que preguntar antes de implementar. Son 4 en total y están listados juntos en la sección 12.
- Este documento **no fija stack tecnológico**. Debe adaptarse al proyecto existente (lenguaje, framework, ORM, motor de base de datos y convenciones de nombres ya presentes en el repositorio).

**Regla de oro:** si algo no está en este documento, no inventarlo. Preguntar.

---

## 1. Qué es el sistema

Aplicación web de gestión para un negocio de computación que presta tres servicios: servicio técnico de equipos informáticos, instalación de cámaras de seguridad y mantenimiento de cámaras de seguridad.

Reemplaza un sistema informal basado en un grupo de WhatsApp. Centraliza órdenes de trabajo, stock de productos de videovigilancia, garantías, comprobantes y comunicación automatizada con el cliente vía Chatbot de WhatsApp.

**Usuarios del sistema:**

| Rol | Quién es | Acceso |
|---|---|---|
| **Administrador** | Dueño del negocio | Todo lo que puede el Técnico, más gestión de usuarios, informes, reposición de stock, anulación de órdenes, alertas y conversaciones del Chatbot |
| **Técnico** | Empleado del negocio | Operación diaria: órdenes, estados, presupuestos, cumplimentación, stock, garantías |
| **Cliente** | Cliente del negocio | **No accede a la aplicación web.** Interactúa exclusivamente por WhatsApp a través del Chatbot |

> **DECISIÓN DE IMPLEMENTACIÓN**
> El Cliente **no tiene cuenta ni login**. No existe registro, ni contraseña, ni portal. Es una entidad de datos y un interlocutor del Chatbot, identificado por su número de teléfono. No implementar autenticación de clientes.

**Alcance del stock:** el sistema controla stock **únicamente** de productos de videovigilancia (DVR, NVR, Cámara, Cable). Las órdenes de servicio técnico **no consumen stock**. Existe **un único stock**: toda unidad dentro del local se considera disponible, sin importar dónde esté físicamente. No hay depósitos, ubicaciones ni sucursales múltiples.

---

## 2. Modelo de datos

Los nombres de entidades y campos son orientativos: adaptarlos a las convenciones del proyecto existente. Lo que **no** es negociable es la existencia de cada campo y sus restricciones.

### 2.1 Usuario

Usuario del sistema (Administrador o Técnico).

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `nombre` | texto | sí | |
| `apellido` | texto | sí | |
| `nombreUsuario` | texto | sí | **Único.** 4–16 caracteres. Sin espacios ni caracteres especiales (solo letras y números) |
| `contrasena` | texto | sí | Almacenada con hash. 4–16 caracteres, debe incluir letras y números, sin espacios |
| `rol` | enum | sí | `ADMINISTRADOR` \| `TECNICO` |
| `activo` | booleano | sí | Default `true`. Ver decisión abajo |

> **DECISIÓN DE IMPLEMENTACIÓN — baja lógica de usuarios**
> RF02.3 dice "eliminar usuarios" y que un usuario eliminado no puede iniciar sesión. Se implementa como **baja lógica** (`activo = false`), no borrado físico. Motivo: las órdenes, cumplimentaciones y registros de auditoría referencian usuarios; un borrado físico rompería el historial, que es justamente lo que RNF09 exige preservar. Un usuario inactivo no puede autenticarse y no aparece en selectores de asignación, pero sigue siendo visible en registros históricos.

> **DECISIÓN DE IMPLEMENTACIÓN — último administrador**
> El sistema DEBE impedir dar de baja o cambiar el rol del último Administrador activo. Sin esto el sistema queda sin acceso administrativo. Mostrar mensaje: *"No es posible dar de baja al único administrador del sistema."*

> **DECISIÓN DE IMPLEMENTACIÓN — baja de técnico con órdenes activas.** El sistema DEBE impedir la baja directa de un Técnico que figure como responsable de al menos una orden no terminal. En su lugar, DEBE ofrecer una reasignación masiva a otro técnico, con motivo obligatorio, y permitir la baja una vez completada. La reasignación masiva y la baja DEBEN ejecutarse en una única transacción: si falla la reasignación de alguna orden, no se da de baja al usuario. Cada orden genera su propio registro en `AsignacionTecnico` — no un registro agrupado — para que el historial por orden siga siendo completo.

### 2.2 Cliente

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `nombre` | texto | sí | |
| `apellido` | texto | sí | |
| `dni` | texto | sí | **Único.** Solo dígitos |
| `telefono` | texto | sí | **Único.** Es la clave de identificación del Chatbot |
| `domicilio` | texto | condicional | Obligatorio solo si el cliente tiene al menos una orden de instalación o mantenimiento de cámaras |

> **DECISIÓN DE IMPLEMENTACIÓN — formato de teléfono**
> El teléfono DEBE normalizarse a un formato canónico al guardarlo (solo dígitos, con código de país), porque es la clave con la que el Chatbot identifica al cliente en los mensajes entrantes. Sin normalización, un mismo cliente cargado como `3854123456` y `+543854123456` genera duplicados y el Chatbot no lo encuentra. Guardar normalizado; mostrar formateado.

### 2.3 OrdenTrabajo

Entidad central del sistema.

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `idOrden` | texto | sí | **PK.** 6 dígitos, correlativo desde `000001`. Ver 2.3.1 |
| `cliente` | FK → Cliente | sí | |
| `tipoServicio` | enum | sí | `SERVICIO_TECNICO` \| `INSTALACION_CAMARAS` \| `MANTENIMIENTO_CAMARAS` |
| `equipo` | texto | condicional | **Obligatorio solo si `tipoServicio = SERVICIO_TECNICO`.** Ver corrección C-01 |
| `cantidadCamaras` | entero | condicional | Obligatorio si el tipo es instalación o mantenimiento |
| `descripcionTrabajo` | texto | sí | Trabajo solicitado por el cliente |
| `fechaIngreso` | fecha | sí | |
| `observaciones` | texto | no | Contraseñas, accesorios entregados, etc. |
| `estado` | enum | sí | Ver máquina de estados, sección 3 |
| `subEstado` | enum | no | Solo válido si `estado = EN_PROCESO`. Ver 2.3.2 |
| `tecnicoResponsable` | FK → Usuario | condicional | Obligatorio desde el alta en instalación y mantenimiento de cámaras. Nullable en servicio técnico hasta la autoasignación. **Obligatorio en los tres tipos antes de pasar a `PRESUPUESTADO`** |
| `fechaNotificacionRetiro` | fecha/hora | no | Se setea al pasar a `PENDIENTE_DE_RETIRO`. Base para el cómputo de 80/90 días |
| `ordenOriginal` | FK → OrdenTrabajo | no | Solo en órdenes generadas por reclamo de garantía. Ver RF15 |
| `bajoGarantia` | booleano | sí | Default `false`. `true` si nació de un reclamo de garantía |
| `motivoAnulacion` | texto | condicional | Obligatorio si `estado = ANULADO` |
| `fechaAnulacion` | fecha/hora | condicional | Obligatorio si `estado = ANULADO` |

#### 2.3.1 Generación del ID de orden (RF03.1.1)

- Numérico, 6 dígitos, con ceros a la izquierda (`000001`, `000002`, …).
- Correlativo global: **uno solo para todo el sistema**, no uno por tipo de servicio.
- Irrepetible y **no reutilizable**, incluso si una orden es anulada.

> **DECISIÓN DE IMPLEMENTACIÓN — concurrencia del correlativo**
> No calcular el siguiente ID con `MAX(idOrden) + 1` en código de aplicación: con dos usuarios cargando órdenes simultáneamente en el mostrador se generan colisiones. Usar un mecanismo atómico provisto por la base de datos (secuencia, tabla de contador con bloqueo, o autoincremento) y formatear a 6 dígitos al persistir. El contador **nunca retrocede**, ni siquiera si la orden se anula.

> **DECISIÓN DE IMPLEMENTACIÓN — agotamiento del rango**
> 6 dígitos permiten 999.999 órdenes. Al superarse, el sistema DEBE fallar de forma explícita y registrada, nunca reiniciar el contador ni reutilizar IDs. Es un escenario remoto pero un reinicio silencioso rompería la unicidad exigida por RF03.1.1.

#### 2.3.2 Sub-estados (RF13.2)

Cuando `estado = EN_PROCESO`, la orden puede tener un sub-estado informativo:

`DIAGNOSTICO` | `ESPERANDO_REPUESTO` | `EN_REPARACION` | `PRUEBAS_FINALES`

Los sub-estados son **puramente informativos**: no alteran el estado principal ni ninguna regla, plazo o transición que dependa de él. Se usan solo para que el Chatbot dé una respuesta más precisa al cliente. Al salir de `EN_PROCESO`, el sub-estado DEBE limpiarse.

### 2.4 Presupuesto

Una orden tiene como máximo un presupuesto vigente.

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `idPresupuesto` | identificador | sí | PK |
| `orden` | FK → OrdenTrabajo | sí | Único por orden |
| `detalle` | texto | sí | Descripción del trabajo a realizar |
| `montoManoObra` | decimal | sí | Ingresado manualmente. ≥ 0 |
| `subtotalMateriales` | decimal | sí | **Calculado por el sistema.** Suma de los detalles. `0` en servicio técnico |
| `montoTotal` | decimal | sí | **Calculado.** `subtotalMateriales + montoManoObra` |
| `fechaCreacion` | fecha/hora | sí | |
| `estado` | enum | sí | `PENDIENTE` \| `APROBADO` \| `RECHAZADO` |
| `fechaRespuestaCliente` | fecha/hora | no | Se registra al recibir la respuesta (RF05.2) |

> **DECISIÓN DE IMPLEMENTACIÓN — montos calculados**
> `subtotalMateriales` y `montoTotal` DEBEN calcularse en el backend y persistirse, no confiarse en el valor que envíe el frontend. El frontend puede calcularlos para mostrarlos en vivo, pero el backend recalcula y valida antes de guardar.

### 2.5 DetallePresupuesto

Clase asociativa entre `Presupuesto` y `Producto`. **Nueva en Rev. 5.0.** Sin ella no se puede calcular el subtotal ni descontar stock.

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `presupuesto` | FK → Presupuesto | sí | |
| `producto` | FK → Producto | sí | |
| `cantidad` | entero | sí | > 0 |
| `precioUnitario` | decimal | sí | **Copiado del producto al crear el detalle.** Ver RF11.6 |
| `subtotal` | decimal | sí | Calculado: `cantidad × precioUnitario` |

> **DECISIÓN DE IMPLEMENTACIÓN — congelamiento de precio**
> `precioUnitario` se copia desde `Producto.precio` en el momento de crear el detalle y **nunca se actualiza**, aunque después cambie el precio del producto. Un presupuesto enviado al cliente no puede cambiar de monto solo, y esto además permite reconstruir el histórico. Nunca leer el precio del producto en vivo para recalcular un presupuesto existente.

### 2.6 Producto

Productos de videovigilancia. Es el stock del sistema.

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `nombre` | texto | sí | |
| `categoria` | enum | sí | `DVR` \| `NVR` \| `CAMARA` \| `CABLE` |
| `stock` | entero | sí | Cantidad física total en el local. ≥ 0 |
| `stockReservado` | entero | sí | Comprometido en presupuestos aprobados no finalizados. ≥ 0. **Nuevo en Rev. 5.0** |
| `stockMinimo` | entero | sí | ≥ 0. Umbral de reposición |
| `precio` | decimal | sí | Precio unitario vigente. ≥ 0 |
| `activo` | booleano | sí | Default `true`. Baja lógica |

**`stockDisponible` es un valor derivado, no un campo:** `stockDisponible = stock − stockReservado`. Es el número que se muestra al presupuestar y el que se valida contra las cantidades solicitadas.

> **DECISIÓN DE IMPLEMENTACIÓN — modelo de stock**
> Se usan dos contadores (`stock` y `stockReservado`) en lugar de descontar directamente al reservar. Motivo: permite distinguir "hay 10 unidades en el local, 4 comprometidas" de "hay 6 unidades", que es información distinta para el administrador al reponer. `stock` refleja la realidad física; `stockReservado` el compromiso comercial.

> **DECISIÓN DE IMPLEMENTACIÓN — baja de productos**
> RF07.1 permite eliminar productos. Se implementa como baja lógica, porque los detalles de presupuestos históricos referencian productos. Un producto inactivo no aparece al presupuestar pero sigue siendo legible en presupuestos anteriores. DEBE impedirse dar de baja un producto con `stockReservado > 0`.

### 2.7 Cumplimentacion

Registro del cierre de un trabajo. Uno por orden.

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `orden` | FK → OrdenTrabajo | sí | Único por orden |
| `fechaRealizacion` | fecha | sí | |
| `descripcionTareas` | texto | sí | Detalle de lo efectivamente realizado |
| `tecnicoEjecutor` | FK → Usuario | sí | |
| `montoCobrado` | decimal | sí | ≥ 0 |
| `metodoPago` | enum | sí | `TRANSFERENCIA` \| `TARJETA_CREDITO` \| `TARJETA_DEBITO` \| `EFECTIVO` (RN-01) |
| `tipoGarantia` | enum | sí | Ver RF03.2.2 |
| `fechaRegistro` | fecha/hora | sí | Momento del registro. Inicio del plazo de garantía |

### 2.8 Garantia

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `cumplimentacion` | FK → Cumplimentacion | sí | Único |
| `tipoGarantia` | enum | sí | Ver tabla de plazos en RF03.2.2 |
| `plazoDias` | entero | sí | Derivado del tipo |
| `fechaInicio` | fecha | sí | = `Cumplimentacion.fechaRegistro` |
| `fechaVencimiento` | fecha | sí | Calculada: `fechaInicio + plazoDias` |

### 2.9 Comprobante

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `numeroComprobante` | texto | sí | **Único**, correlativo |
| `cumplimentacion` | FK → Cumplimentacion | sí | Único |
| `fechaEmision` | fecha/hora | sí | |
| `total` | decimal | sí | = `Cumplimentacion.montoCobrado` |
| `archivoPdf` | referencia | sí | Ruta o identificador del PDF generado |

Aplica la misma regla de correlativo atómico que el ID de orden.

### 2.10 ReposicionStock

Pedido de reposición registrado por el Administrador. **Nueva en Rev. 5.0.**

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `proveedor` | texto | sí | **Texto libre descriptivo.** No es una entidad ni un actor del sistema |
| `fechaPedido` | fecha | sí | |
| `fechaEstimadaRecepcion` | fecha | no | |
| `estado` | enum | sí | `SOLICITADO` \| `CONFIRMADO` \| `RECIBIDO` |
| `usuarioRegistro` | FK → Usuario | sí | |

### 2.11 DetalleReposicion

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `reposicion` | FK → ReposicionStock | sí | |
| `producto` | FK → Producto | sí | |
| `cantidadSolicitada` | entero | sí | > 0 |
| `cantidadRecibida` | entero | sí | Default `0`. ≤ `cantidadSolicitada` |

### 2.12 Alerta

Alerta interna para el Administrador. **Nueva en Rev. 5.0.**

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `tipo` | enum | sí | `VENCIMIENTO_RETIRO` \| `ORDEN_SIN_ASIGNAR`. Enum extensible a futuro |
| `orden` | FK → OrdenTrabajo | sí | |
| `mensaje` | texto | sí | |
| `fechaGeneracion` | fecha/hora | sí | |
| `estado` | enum | sí | `ACTIVA` \| `VISTA` \| `RESUELTA` |

Una orden puede tener 0..* alertas.

### 2.13 ReclamoGarantia

**Nueva en Rev. 5.0.**

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `id` | identificador | sí | PK |
| `ordenOriginal` | FK → OrdenTrabajo | sí | |
| `ordenGenerada` | FK → OrdenTrabajo | no | Solo si el reclamo fue aceptado |
| `fechaReclamo` | fecha/hora | sí | |
| `observacionesInspeccion` | texto | sí | |
| `resultado` | enum | sí | `ACEPTADO` \| `RECHAZADO` |
| `motivoRechazo` | texto | condicional | Obligatorio si `resultado = RECHAZADO` |
| `usuarioRegistro` | FK → Usuario | sí | |

### 2.14 Entidades de auditoría

Todas son **solo de escritura**: el sistema inserta, nunca actualiza ni borra. No exponer endpoints de modificación ni borrado (RNF09).

**HistorialEstado**

| Campo | Tipo | Obligatorio |
|---|---|---|
| `id` | identificador | sí |
| `orden` | FK → OrdenTrabajo | sí |
| `estadoAnterior` | enum | no (null en el alta) |
| `estadoNuevo` | enum | sí |
| `fechaHora` | fecha/hora | sí |
| `usuario` | FK → Usuario | no (null si el cambio fue automático) |
| `automatico` | booleano | sí |

**AsignacionTecnico**

| Campo | Tipo | Obligatorio |
|---|---|---|
| `id` | identificador | sí |
| `orden` | FK → OrdenTrabajo | sí |
| `tecnicoAsignado` | FK → Usuario | sí |
| `tecnicoAnterior` | FK → Usuario | no |
| `fechaHora` | fecha/hora | sí |
| `usuarioResponsable` | FK → Usuario | sí |
| `motivo` | texto | condicional — obligatorio en reasignaciones |
| `tipoAsignacion` | enum: `INICIAL` \| `AUTOASIGNACION` \| `REASIGNACION` \| `REASIGNACION_POR_BAJA` | sí |

**MovimientoStock**

| Campo | Tipo | Obligatorio |
|---|---|---|
| `id` | identificador | sí |
| `producto` | FK → Producto | sí |
| `tipoMovimiento` | enum: `RESERVA` \| `LIBERACION` \| `DESCUENTO_DEFINITIVO` \| `REPOSICION` \| `AJUSTE_MANUAL` | sí |
| `cantidad` | entero | sí |
| `orden` | FK → OrdenTrabajo | no (null en reposiciones y ajustes) |
| `fechaHora` | fecha/hora | sí |
| `usuario` | FK → Usuario | no (null si fue automático) |

**RegistroAuditoria** — para operaciones que no encajan en las anteriores (anulaciones, carga y modificación de presupuestos).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `id` | identificador | sí |
| `tipoOperacion` | enum: `ANULACION_ORDEN` \| `CARGA_PRESUPUESTO` \| `MODIFICACION_PRESUPUESTO` | sí |
| `entidadAfectada` | texto | sí |
| `idEntidad` | texto | sí |
| `descripcion` | texto | sí |
| `fechaHora` | fecha/hora | sí |
| `usuario` | FK → Usuario | sí |

### 2.15 ConversacionChatbot

Registro de mensajes intercambiados con el cliente, para auditoría (RF14).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `id` | identificador | sí |
| `cliente` | FK → Cliente | sí |
| `orden` | FK → OrdenTrabajo | no |
| `direccion` | enum: `ENTRANTE` \| `SALIENTE` | sí |
| `contenido` | texto | sí |
| `fechaHora` | fecha/hora | sí |

---

## 3. Máquinas de estado

Las transiciones son **cerradas**: cualquier transición que no figure en las tablas DEBE ser rechazada por el backend con un error explícito. No basta con ocultar la opción en la interfaz.

### 3.1 Servicio técnico (RF04.1)

Estados: `INGRESADO`, `PRESUPUESTADO`, `APROBADO`, `RECHAZADO`, `EN_PROCESO`, `PENDIENTE_DE_RETIRO`, `ENTREGADO`, `ABANDONADO`, `ANULADO`

| Desde | Hacia | Disparador |
|---|---|---|
| — | `INGRESADO` | Alta de la orden (RF03.1.2) |
| `INGRESADO` | `PRESUPUESTADO` | El técnico carga el presupuesto (CU4). Requiere técnico responsable asignado (RN-11) |
| `PRESUPUESTADO` | `APROBADO` | El cliente confirma vía Chatbot, o intervención manual del técnico |
| `PRESUPUESTADO` | `RECHAZADO` | El cliente rechaza vía Chatbot, o intervención manual |
| `APROBADO` | `EN_PROCESO` | El técnico inicia la reparación |
| `EN_PROCESO` | `PENDIENTE_DE_RETIRO` | El técnico finaliza la reparación |
| `PENDIENTE_DE_RETIRO` | `ENTREGADO` | El cliente paga y retira el equipo |
| `PENDIENTE_DE_RETIRO` | `ABANDONADO` | **Automático**, día 90 (RF05.5) |
| Cualquiera sin cumplimentación | `ANULADO` | Anulación por el Administrador (RF17) |

**Estados terminales:** `ENTREGADO`, `ABANDONADO`, `RECHAZADO`, `ANULADO`.

### 3.2 Instalación y mantenimiento de cámaras (RF04.2)

Estados: `AGENDADO`, `PRESUPUESTADO`, `APROBADO`, `RECHAZADO`, `EN_PROCESO`, `FINALIZADO`, `ANULADO`

| Desde | Hacia | Disparador |
|---|---|---|
| — | `AGENDADO` | Alta de la orden (RF03.1.2) |
| `AGENDADO` | `PRESUPUESTADO` | El técnico carga el presupuesto tras la inspección |
| `PRESUPUESTADO` | `APROBADO` | Confirmación del cliente. **Dispara la reserva de stock** |
| `PRESUPUESTADO` | `RECHAZADO` | Rechazo del cliente |
| `APROBADO` | `EN_PROCESO` | El técnico inicia el trabajo en el domicilio |
| `EN_PROCESO` | `FINALIZADO` | Trabajo terminado y cobrado. **Dispara el descuento definitivo de stock** |
| Cualquiera sin cumplimentación | `ANULADO` | Anulación por el Administrador |

**Estados terminales:** `FINALIZADO`, `RECHAZADO`, `ANULADO`.

Los estados `PENDIENTE_DE_RETIRO` y `ABANDONADO` **no existen** en estos dos tipos de servicio. Por lo tanto tampoco aplican el control de 80/90 días ni las alertas de vencimiento.

### 3.3 Efectos colaterales por transición

Cada transición dispara acciones automáticas. Todas DEBEN ejecutarse dentro de la misma transacción que el cambio de estado; si alguna falla, la transición completa se revierte.

| Transición | Efectos |
|---|---|
| → `PRESUPUESTADO` | Validar que exista técnico responsable; rechazar la transición si no lo hay · Guardar presupuesto · Registrar en `RegistroAuditoria` · Chatbot envía presupuesto al cliente (RF05.1) |
| → `APROBADO` | `Presupuesto.estado = APROBADO` · Registrar `fechaRespuestaCliente` · **Reservar stock** (solo cámaras) · Exigir técnico responsable (RN-11) |
| → `RECHAZADO` | `Presupuesto.estado = RECHAZADO` · Registrar `fechaRespuestaCliente` · **Liberar reservas** si las hubiera · Orden queda cerrada (RN-10) |
| → `PENDIENTE_DE_RETIRO` | Setear `fechaNotificacionRetiro = ahora` · Chatbot notifica retiro (RF05.3) · Activar el control de plazos |
| → `ENTREGADO` | Ninguno automático. Habilita el registro de cumplimentación |
| → `FINALIZADO` | **Descuento definitivo de stock** · Habilita el registro de cumplimentación |
| → `ABANDONADO` | Chatbot envía mensaje final (RF05.5) · Resolver alerta activa · Marcar la orden como cumplimentada a efectos estadísticos |
| → `ANULADO` | Liberar reservas · Registrar motivo, usuario y fecha · Bloquear la orden |
| Cualquiera | Insertar registro en `HistorialEstado` |

> **DECISIÓN DE IMPLEMENTACIÓN — envío de mensajes y transaccionalidad**
> El envío por WhatsApp es una llamada a un servicio externo y **no debe bloquear la transacción de base de datos**. Patrón a usar: la transacción persiste el cambio de estado y encola el mensaje; un proceso posterior lo envía y registra el resultado en `ConversacionChatbot`. Si el envío falla, se reintenta sin revertir el cambio de estado. Un cambio de estado nunca debe perderse porque WhatsApp estaba caída.

---

## 4. Reglas de negocio

Son invariantes del sistema. Deben validarse en el backend, no solo en la interfaz.

**RN-01 — Métodos de pago.** Solo se aceptan transferencia bancaria, tarjeta de crédito, tarjeta de débito o efectivo. El pago total se realiza al momento de la entrega del equipo o al finalizar la instalación. *No existen pagos parciales, cuentas corrientes ni financiación.*

**RN-02 — Requisito de retiro.** El titular o una persona autorizada debe presentar DNI para retirar un equipo reparado. Es una regla operativa del mostrador; el sistema no la valida automáticamente.

**RN-03 — Plazo de retiro.** Desde la notificación de finalización, el cliente dispone de 90 días corridos para retirar el equipo.

**RN-04 — Declaración de abandono.** Vencidos los 90 días, el negocio puede considerar el equipo abandonado.

**RN-05 — Plazos de garantía.**

| Servicio | Plazo |
|---|---|
| Mantenimiento y software (servicio técnico) | 30 días |
| Reparaciones electrónicas y cambios de hardware (servicio técnico) | 90 días |
| Mantenimiento de cámaras | 30 días |
| Instalación de cámaras (mano de obra) | 6 meses |

**RN-06 — Condiciones de aceptación de garantía.** El equipo debe presentar la misma falla original, el trabajo debe estar registrado en el sistema y debe presentarse el comprobante.

**RN-07 — Anulación de garantía.** La garantía queda anulada si se constata: daños físicos posteriores a la entrega, daños por líquidos o sobretensiones, o signos de desarme o alteración de software por terceros.

**RN-08 — Cumplimentación.** Una orden se considera cumplimentada cuando el cliente pagó el servicio y retiró el equipo (esto último solo en servicio técnico).

**RN-09 — Bloqueo de orden cumplimentada.** Una vez registrada la cumplimentación, la orden queda cerrada definitivamente. Ningún dato asociado puede modificarse.

**RN-10 — Cierre de órdenes rechazadas.** *(Nueva)* Una orden `RECHAZADO` se considera cerrada a fines operativos y estadísticos, aunque no cumpla RN-08. Los informes DEBEN distinguir órdenes cumplimentadas de órdenes cerradas por rechazo.

**RN-11 — Responsable de la orden de trabajo.** Toda orden de trabajo debe tener un técnico responsable asignado antes de pasar al estado "Presupuestado". En las órdenes de instalación y mantenimiento de cámaras, el técnico responsable se asigna al momento del registro de la solicitud, junto con la coordinación de la fecha de visita. En las órdenes de servicio técnico, la orden se registra sin responsable y un técnico puede autoasignarse cualquier orden que no tenga uno. La reasignación de una orden ya asignada solo puede ser realizada por el usuario Administrador, indicando el motivo. El sistema debe conservar el historial de cada asignación y reasignación.

**RN-12 — Reclamos de garantía.** *(Nueva)* Para procesar un reclamo debe verificarse: (a) que la orden esté dentro del plazo vigente (RN-05), (b) que la falla coincida con la original (RN-06), y (c) que no haya causales de anulación (RN-07). Todo reclamo DEBE quedar vinculado a la orden original.

**RN-13 — Anulación de órdenes.** *(Nueva)* Las órdenes **no pueden eliminarse**. Una orden cargada por error puede anularse, registrando motivo, usuario y fecha/hora. La orden anulada conserva su identificador, que no se reutiliza, y permanece consultable. Solo pueden anularse órdenes no cumplimentadas.

---

## 5. Requisitos funcionales

### RF01 — Autenticación

**RF01.1 Inicio de sesión.** Login con nombre de usuario y contraseña. Éxito solo si coinciden con un usuario **activo**. En caso contrario, mensaje de error genérico y posibilidad de reintentar.

> **DECISIÓN DE IMPLEMENTACIÓN**
> El mensaje de error NO debe revelar si el usuario existe o si la contraseña es incorrecta. Usar siempre: *"Usuario o contraseña incorrectos."*

**RF01.2 Validación de credenciales.** Nombre de usuario: único, 4–16 caracteres, sin espacios ni caracteres especiales. Contraseña: 4–16 caracteres, con letras y números, sin espacios.

**RF01.3 Cierre de sesión.** Disponible en todo momento; invalida el acceso hasta un nuevo login.

### RF02 — Gestión de usuarios

Exclusivo del Administrador.

- **RF02.1** Crear usuario: nombre, apellido, nombre de usuario, contraseña, rol.
- **RF02.2** Modificar usuario, respetando las reglas de RF01.2.
- **RF02.3** Dar de baja usuario (baja lógica). Un usuario dado de baja no puede iniciar sesión.
- **RF02.4** Consultar listado: nombre, nombre de usuario y rol.

### RF03 — Gestión de solicitudes de trabajo

**RF03.1 Registro de nueva solicitud.** Datos (obligatorios salvo indicación):

- Datos del cliente: nombre, apellido, DNI, teléfono, domicilio *(este último obligatorio solo en instalación y mantenimiento)*.
- Tipo de servicio.
- **Equipo** — obligatorio **solo para servicio técnico** *(corrección C-01)*.
- **Cantidad de cámaras** — obligatorio solo para instalación y mantenimiento.
- **Técnico responsable** — obligatorio únicamente para órdenes de instalación o mantenimiento de cámaras.
- Descripción del trabajo solicitado.
- Observaciones *(opcional)*.

**RF03.1.1 ID de orden.** Ver 2.3.1. Irrepetible y no reutilizable, **incluso si una orden es anulada** *(corrección C-08)*.

**RF03.1.2 Estado inicial.** `INGRESADO` para servicio técnico; `AGENDADO` para instalación y mantenimiento.

**RF03.2 Registro de cumplimentación.** Datos obligatorios: fecha de realización, descripción de tareas, técnico ejecutor, monto cobrado, método de pago, tipo de garantía. El campo "Técnico que realizó la tarea" se autocompleta con el técnico responsable de la orden, permitiendo modificarlo si el trabajo fue ejecutado por otro técnico.

El método de pago DEBE corresponder a uno de los habilitados por RN-01 *(corrección C-03)*.

**RF03.2.1 Requisito de cumplimentación.** El estado de la orden debe ser `ENTREGADO` o `FINALIZADO`. La opción debe estar deshabilitada en cualquier otro estado.

> **NOTA DE ALCANCE**
> El equipo revisó este requisito y decidió mantenerlo tal cual. El flujo resultante es: el técnico cobra y entrega → cambia el estado a `ENTREGADO`/`FINALIZADO` (CU4) → registra la cumplimentación (CU3), que carga monto, garantía y genera el comprobante. **Implementar exactamente así.** No "corregir" el orden por iniciativa propia.

**RF03.2.2 Registro de garantía.** El plazo se determina por el tipo de servicio y el tipo de garantía seleccionado, según la tabla de RN-05. La fecha de inicio es la fecha de registro de la cumplimentación.

**RF03.2.3 Deshabilitar modificación.** Registrada la cumplimentación, la orden queda bloqueada (RN-09). El backend DEBE rechazar toda modificación, no solo ocultar los controles.

**RF03.3 Generación de comprobante.** PDF automático al registrar la cumplimentación, con: número de comprobante, datos del negocio (nombre, CUIT, teléfono, email, dirección), datos del cliente, trabajo realizado (ID de orden, tipo de servicio, equipo, fecha, técnico, detalles), monto y método de pago, tipo y plazo de garantía, fecha de emisión.

**RF03.4 Impresión de comprobante** desde la interfaz.

### RF04 — Gestión de estados

**RF04.1 / RF04.2** — ver máquinas de estado en la sección 3. Se agrega `ANULADO` a ambos conjuntos *(corrección C-08)*.

### RF05 — Automatización mediante Chatbot

**RF05.1 Envío de presupuesto.** Al pasar a `PRESUPUESTADO`, enviar al WhatsApp del cliente: detalle del trabajo, monto presupuestado y solicitud de confirmación. Envío inmediato tras el registro del cambio de estado.

**RF05.2 Recepción de confirmación.** Procesar la respuesta e interpretar aceptación o rechazo. Actualizar el estado a `APROBADO` o `RECHAZADO` y registrar fecha y hora. Sin respuesta, la orden permanece en `PRESUPUESTADO` indefinidamente hasta que responda o intervenga un técnico.

**RF05.2.1 Interpretación de respuesta.** La respuesta válida es `Confirmar` o `Rechazar`, sin distinción de mayúsculas. Si no es interpretable, solicitar reenvío en formato válido.

> **DECISIÓN DE IMPLEMENTACIÓN**
> Normalizar antes de comparar: pasar a minúsculas, recortar espacios y quitar acentos. Aceptar exactamente `confirmar` y `rechazar` como palabras. Cualquier otra cosa dispara el pedido de reenvío. No implementar interpretación difusa ni sinónimos: el requisito es explícito y una interpretación errónea aprueba o rechaza un trabajo real.

**RF05.3 Notificación de retiro.** Al pasar a `PENDIENTE_DE_RETIRO`, notificar que el equipo está listo, incluyendo días y horarios de atención y requisitos para el retiro (RN-02).

**RF05.4 Envío de comprobante.** Al registrarse la cumplimentación, enviar el PDF con aviso de trabajo finalizado y cobrado.

**RF05.5 Recordatorio de vencimiento y abandono.** Control **diario** del plazo transcurrido desde `fechaNotificacionRetiro` en órdenes `PENDIENTE_DE_RETIRO`:

- **Día 80:** el Chatbot envía recordatorio al cliente **y el sistema genera una alerta interna para el Administrador (RF16)** *(corrección C-07)*.
- **Día 90:** el sistema cambia el estado a `ABANDONADO`, lo registra como cumplimentado, **el Chatbot envía un mensaje final informando la declaración de abandono**, y la alerta asociada se marca como resuelta.

> **DECISIÓN DE IMPLEMENTACIÓN — proceso programado**
> Implementar como tarea programada diaria. Requisitos: (a) **idempotente** — si corre dos veces el mismo día no debe duplicar mensajes ni alertas; (b) **recuperable** — si no corrió durante N días, al ejecutarse debe procesar todas las órdenes que hayan cruzado el umbral en el ínterin, no solo las de hoy. Verificar antes de actuar si ya existe la alerta o el mensaje del día correspondiente.

### RF06 — Consultas e historial

**RF06.1 Trabajos pendientes.** Listado con: ID, estado, datos del cliente, tipo de servicio, descripción, fecha de ingreso, observaciones. Mensaje explícito si no hay resultados.

**RF06.1.1 Filtros:** ID, cliente (nombre o DNI), equipo, tipo de servicio, rango de fechas, estado.

**RF06.2 Trabajos cumplimentados.** Listado con los datos anteriores más: fecha de realización, descripción de tareas, técnico, monto y método de pago, número de comprobante, plazo de garantía.

**RF06.2.1 Filtros:** ID, cliente, equipo, tipo de servicio, rango de fechas.

### RF07 — Gestión de productos

**RF07.1** Alta, modificación y baja de productos: nombre, categoría (DVR/NVR/Cámara/Cable), stock, mínimo de stock, precio.

**RF07.2** Consulta del listado con esos datos, más `stockReservado` y `stockDisponible`.

### RF08 — Informes y estadísticas

**RF08.1** Informes filtrables por período, con: cantidad total de trabajos realizados, ingresos totales, tipos de servicio más solicitados, cantidad por tipo de servicio, ingresos por tipo de servicio, resumen por tipo.

Los informes DEBEN **excluir del cálculo** las órdenes `ANULADO` (RF17.6) y **distinguir** las cerradas por rechazo (RN-10).

**RF08.2** Exportación a PDF y Excel, respetando los filtros aplicados.

### RF09 — Verificación de cliente existente *(nuevo)*

- **RF09.1** Al iniciar el registro de una solicitud, permitir buscar si el cliente ya existe, por DNI o teléfono.
- **RF09.1.1** Si existe, autocompletar sus datos y continuar directamente con la carga del servicio.
- **RF09.1.2** Si no existe, mostrar el formulario completo de alta.

### RF10 — Asignación de técnico responsable *(nuevo, redefinido por `GESTECH_CAMBIOS_ASIGNACION.md`)*

- **RF10.1** — En las órdenes de instalación y mantenimiento de cámaras, el sistema debe permitir seleccionar el técnico responsable durante el registro de la solicitud, siendo este dato obligatorio.
- **RF10.2** — En las órdenes de servicio técnico, el sistema debe permitir que un usuario Técnico se autoasigne como responsable de una orden que no tenga responsable asignado.
- **RF10.3** — El sistema debe impedir el cambio de estado a "Presupuestado" si la orden no tiene un técnico responsable asignado.
- **RF10.4** — La reasignación de una orden con responsable asignado solo puede ser realizada por el usuario Administrador, requiriendo el ingreso obligatorio de un motivo.
- **RF10.5** — Cada asignación o reasignación debe registrarse indicando fecha, hora, técnico asignado, técnico anterior (si lo hubiera), usuario que realizó el cambio y motivo (en caso de reasignación).
- **RF10.6** — El sistema debe mostrar en el panel principal la cantidad de órdenes de trabajo sin técnico responsable asignado.
- **RF10.7** — El sistema debe impedir dar de baja a un usuario Técnico que tenga órdenes de trabajo activas asignadas, mostrando el listado de dichas órdenes y ofreciendo reasignarlas antes de continuar.
- **RF10.8** — El sistema debe permitir reasignar en una única operación todas las órdenes activas de un técnico a otro técnico, requiriendo el ingreso de un motivo. Cada orden reasignada debe registrarse individualmente en el historial de asignaciones. Completada la reasignación, el sistema debe permitir dar de baja al usuario.

### RF11 — Presupuesto con detalle de productos *(nuevo)*

- **RF11.1** En órdenes de **instalación y mantenimiento de cámaras**, permitir seleccionar productos del stock indicando cantidad de cada uno.
- **RF11.2** Calcular automáticamente subtotal por producto y subtotal de materiales; permitir ingreso manual de mano de obra; total = suma de ambos.
- **RF11.3** Validar que la cantidad solicitada de cada producto no supere `stockDisponible`.
- **RF11.4** Al aprobarse el presupuesto, **reservar** las cantidades (`stockReservado += cantidad`).
- **RF11.5** Al finalizarse el trabajo, **descontar definitivamente** (`stock -= cantidad`, `stockReservado -= cantidad`). Si la orden es rechazada o anulada, **liberar** (`stockReservado -= cantidad`).
- **RF11.6** El precio unitario queda congelado en el presupuesto al momento de su elaboración.
- **RF11.7** Las órdenes de **servicio técnico no consumen stock**: su presupuesto se compone de detalle del trabajo y mano de obra únicamente.

> **DECISIÓN DE IMPLEMENTACIÓN — concurrencia de stock**
> Las operaciones de reserva y descuento DEBEN ser atómicas y validar disponibilidad **dentro de la misma transacción** en que se modifican los contadores. Validar antes y actualizar después, sin bloqueo, permite que dos aprobaciones simultáneas reserven la misma unidad. Usar bloqueo a nivel de fila o una actualización condicional que falle si no hay disponibilidad.

### RF12 — Registro de reposición de stock *(nuevo)*

- **RF12.1** El Administrador registra un pedido: productos, cantidades, proveedor (texto libre) y fecha estimada de recepción.
- **RF12.2** Seguimiento por estados: `SOLICITADO` → `CONFIRMADO` → `RECIBIDO`.
- **RF12.3** Al registrar la recepción, incrementar el stock según la cantidad efectivamente recibida. Admitir recepciones parciales.
- **RF12.4** Cuando un presupuesto de cámaras requiera productos sin stock suficiente, advertirlo y permitir registrar el pedido de reposición correspondiente.
- **RF12.5** El proveedor es **dato informativo**. El sistema no envía notificaciones ni habilita acceso a proveedores. No es un actor del sistema.

### RF13 — Consulta de estado vía Chatbot *(nuevo)*

- **RF13.1** El cliente consulta el estado de su orden enviando un mensaje al Chatbot (ej. "estado").
- **RF13.1.1** Si tiene más de una orden activa, el Chatbot solicita el ID de orden.
- **RF13.1.2** El sistema DEBE validar que la orden consultada corresponda al teléfono desde el que se consulta, impidiendo el acceso a órdenes ajenas.
- **RF13.2** Si el estado es `EN_PROCESO`, informar además el sub-estado vigente.

> **DECISIÓN DE IMPLEMENTACIÓN — "orden activa"**
> Se considera activa toda orden cuyo estado **no** sea terminal (`ENTREGADO`, `ABANDONADO`, `RECHAZADO`, `ANULADO`, `FINALIZADO`). Si el cliente no tiene ninguna activa, responder que no se encontraron órdenes en curso.

### RF14 — Consulta de conversaciones del Chatbot *(nuevo)*

El Administrador puede consultar el historial de conversaciones entre el Chatbot y los clientes, con fines de auditoría. **Solo lectura**: no se permite intervenir manualmente en la conversación ni editar o borrar mensajes.

### RF15 — Reclamo de garantía *(nuevo)*

- **RF15.1** Permitir registrar un reclamo sobre una orden cumplimentada, validando que esté dentro del plazo vigente (RN-05).
- **RF15.2** Vincular el reclamo a la orden original y generar una nueva orden marcada como "Bajo garantía".

> **DECISIÓN DE IMPLEMENTACIÓN — orden bajo garantía**
> La orden generada es una orden normal (`bajoGarantia = true`, `ordenOriginal` apuntando a la original) que recorre el flujo de estados habitual, con dos diferencias: no requiere presupuesto (el trabajo no se cobra) y su cumplimentación se registra con `montoCobrado = 0`. Debe excluirse del cálculo de ingresos en RF08 pero contarse como trabajo realizado.

### RF16 — Alerta interna por vencimiento de plazo de retiro *(nuevo)*

- **RF16.1** Al cumplirse 80 días desde la notificación de finalización de una orden en `PENDIENTE_DE_RETIRO`, generar una alerta interna para el Administrador con ID de orden, datos del cliente, equipo y fecha de vencimiento del plazo.
- **RF16.2** Las alertas se visualizan **dentro del sistema**, en el panel del Administrador, con acceso directo a la orden. **No se envían por canales externos** (email, WhatsApp ni ningún otro).
- **RF16.3** El Administrador puede marcar una alerta como vista.
- **RF16.4** Al declararse el abandono (día 90), la alerta se marca como resuelta automáticamente.
- **RF16.5** Aplica **únicamente a órdenes de servicio técnico**.
- **RF16.6** El sistema debe generar una alerta interna dirigida al Administrador cuando una orden de servicio técnico permanezca más de 7 días sin técnico responsable asignado.

### RF17 — Anulación de orden de trabajo *(nuevo)*

- **RF17.1** Solo el **Administrador** puede anular una orden cargada por error.
- **RF17.2** Requiere motivo obligatorio. Registrar usuario, fecha y hora.
- **RF17.3** DEBE impedirse anular órdenes ya cumplimentadas.
- **RF17.4** La orden pasa a `ANULADO`, queda bloqueada para toda modificación y conserva su identificador.
- **RF17.5** Si tenía productos reservados, liberar las reservas.
- **RF17.6** Los informes DEBEN excluir las órdenes anuladas del cálculo, permitiendo listarlas por separado.

---

## 6. Requisitos no funcionales

**RNF01 Plataforma.** Aplicación web compatible con Chrome ≥100, Firefox ≥100, Edge ≥100 y Safari ≥15. Debe funcionar correctamente entre 360×640 y 1920×1080.

**RNF02 Usabilidad.** Un usuario sin experiencia técnica debe poder registrar una solicitud completa en ≤3 minutos sin asistencia, en al menos el 80% de los casos evaluados.

**RNF03 Seguridad.** HTTPS. Contraseñas con hash. Control de acceso por rol, restringiendo cada funcionalidad según el rol asignado.

**RNF04 Rendimiento.** Consultas de órdenes e historial en <3 segundos en condiciones normales.

**RNF05 Escalabilidad.** Debe soportar el crecimiento de órdenes, clientes y usuarios sin degradar el rendimiento.

**RNF06 Disponibilidad.** 99% mensual.

**RNF07 Mantenibilidad.** Arquitectura en capas, con separación entre lógica de negocio y presentación.

**RNF08 Integración con WhatsApp.** El Chatbot se integra con una API oficial de WhatsApp, de forma transparente para el usuario del sistema.

**RNF09 Trazabilidad.** *(Nuevo)* El sistema DEBE mantener un historial de auditoría de las operaciones sobre órdenes y stock, registrando usuario responsable, fecha y hora. Como mínimo:

- cambios de estado de órdenes;
- asignaciones y reasignaciones de técnico;
- carga y modificación de presupuestos;
- anulaciones de órdenes, con su motivo;
- movimientos de stock: reservas, descuentos definitivos, liberaciones y reposiciones.

El historial DEBE ser de **solo lectura**: no puede modificarse ni eliminarse desde el sistema. Consultable por el Administrador.

---

## 7. Matriz de permisos

| Funcionalidad | Administrador | Técnico | Cliente (Chatbot) |
|---|---|---|---|
| Iniciar sesión | ✓ | ✓ | — |
| Registrar solicitud de trabajo | ✓ | ✓ | — |
| Actualizar estados de órdenes | ✓ | ✓ | — |
| Cargar presupuesto | ✓ | ✓ | — |
| Registrar cumplimentación | ✓ | ✓ | — |
| Consultar trabajos pendientes y cumplimentados | ✓ | ✓ | — |
| Gestionar productos (ABM) | ✓ | ✓ | — |
| Registrar reclamo de garantía | ✓ | ✓ | — |
| Gestionar usuarios | ✓ | — | — |
| Generar informes y estadísticas | ✓ | — | — |
| Registrar reposición de stock | ✓ | — | — |
| Anular orden de trabajo | ✓ | — | — |
| Ver y gestionar alertas | ✓ | — | — |
| Consultar conversaciones del Chatbot | ✓ | — | — |
| Consultar historial de auditoría | ✓ | — | — |
| Confirmar/rechazar presupuesto | — | — | ✓ |
| Consultar estado de su orden | — | — | ✓ |
| Asignar técnico al crear orden de cámaras | ✓ | ✓ | — |
| Autoasignarse una orden sin responsable | — | ✓ | — |
| Reasignar una orden ya asignada | ✓ | — | — |
| Reasignación masiva por baja de usuario | ✓ | — | — |

El Administrador hereda todas las capacidades del Técnico. Los permisos DEBEN verificarse en el backend en cada endpoint; ocultar opciones en la interfaz no es control de acceso.

---

## 8. Casos de uso

Formato: precondición, secuencia, flujos alternativos, postcondición. Los CU1–CU10 existían en la Rev. 4.0; CU11–CU15 son nuevos.

### CU1 — Autenticar usuario
**Actores:** Técnico, Administrador. **Precondición:** usuario registrado y activo.
1. Ingresa usuario y contraseña → 2. Valida → 3. Verifica credenciales → 4. Redirige al panel según rol.
**Alt. 4.1:** credenciales inválidas → mensaje de error genérico, permite reintentar.

### CU2 — Registrar solicitud de trabajo *(actualizado)*
**Actores:** Técnico, Administrador. **Precondición:** usuario logueado.

| Actor | Sistema |
|---|---|
| 1. Selecciona registrar nueva solicitud | 2. Solicita DNI o teléfono del cliente |
| 3. Ingresa DNI o teléfono | 4. Busca el cliente. 4.1 Si existe → autocompleta y va al paso 6. 4.2 Si no existe → muestra alta de cliente |
| 5. *(Solo si no existe)* Ingresa datos del cliente | 6. Muestra formulario de la solicitud |
| 7. Ingresa datos, incluyendo técnico responsable (solo instalación y mantenimiento de cámaras) | 8. Valida obligatorios. 9. Genera la orden con ID correlativo y estado inicial |

**Alt. 8.1:** faltan obligatorios → solicita completarlos.
**Postcondición:** orden generada con cliente verificado.

### CU3 — Registrar cumplimentación de trabajo
**Actores:** Técnico, Administrador. **Precondición:** orden en `ENTREGADO` o `FINALIZADO`.

| Actor | Sistema |
|---|---|
| 1. Selecciona la orden | 2. Muestra formulario de cumplimentación, con técnico ejecutor autocompletado desde el técnico responsable |
| 3. Ingresa fecha, tareas, técnico ejecutor, monto y método de pago, tipo de garantía | 4. Valida obligatorios y método de pago (RN-01). 5. Registra la cumplimentación. 6. Bloquea la orden. 7. Genera comprobante. 8. Lo envía por Chatbot |

**Alt. 3.1:** faltan obligatorios → solicita completarlos.

### CU4 — Actualizar estados de órdenes *(ampliado)*
**Actores:** Técnico, Administrador. **Precondición:** orden registrada y no cumplimentada.

| Actor | Sistema |
|---|---|
| 1. Selecciona la orden | |
| 2. Selecciona el nuevo estado | 2.1 Si el nuevo estado es `PRESUPUESTADO`: valida que exista técnico responsable asignado; si no lo hay, rechaza. Muestra el formulario de presupuesto (detalle y monto). En instalación/mantenimiento, incluye el listado de productos disponibles con categoría, stock disponible y precio unitario |
| 2.2 Ingresa el detalle y, si corresponde, selecciona productos y cantidades | Calcula automáticamente subtotal por producto y subtotal de materiales, actualizando ante cada cambio |
| 2.3 Ingresa manualmente el monto de mano de obra | 2.4 Calcula el total = materiales + mano de obra |
| | 2.5 Valida obligatorios y disponibilidad de stock; guarda el presupuesto |
| | 3. Actualiza el estado |

**Alternativos:**
- **2.1.1** Si no hay técnico responsable asignado → mensaje "Debe asignarse un técnico responsable antes de presupuestar", no avanza.
- **2.5.1** Si la cantidad de algún producto supera el disponible → mensaje indicando producto y cantidad disponible; solicita corregir.
- **3.1** Si el nuevo estado es `PRESUPUESTADO` → ir a CU5.
- **3.2** Si el nuevo estado es `PENDIENTE_DE_RETIRO` → el Chatbot notifica que el equipo está listo.
- **3.2.1** A los 80 días sin retiro → recordatorio automático al cliente **y alerta interna al Administrador (RF16)**.
- **3.2.2** A los 90 días sin retiro → estado `ABANDONADO`, registro como cumplimentado y mensaje final al cliente.
- **Autoasignación:** en órdenes de servicio técnico sin responsable, el actor puede autoasignarse. El sistema registra fecha, hora y usuario.
- **Reasignación:** solo el Administrador puede reasignar una orden ya asignada, previo a su cumplimentación, ingresando el motivo. El sistema registra fecha, hora, técnico anterior y usuario responsable.

### CU5 — Confirmar/Rechazar presupuesto
**Actores:** Cliente. **Precondición:** orden en `PRESUPUESTADO`.
1. *(Sistema)* Envía presupuesto por Chatbot → 2. Cliente recibe → 3. Responde confirmando o rechazando → 4. Sistema interpreta → 5. Actualiza a `APROBADO` o `RECHAZADO` → 6. Registra fecha y hora.
**Alt. 3.1:** sin respuesta → permanece en `PRESUPUESTADO`.
**Alt. 4.1:** respuesta no interpretable → solicita reenvío en formato válido.

### CU6 — Consultar trabajos a realizar
**Actores:** Técnico, Administrador. Listado de órdenes pendientes con filtros (RF06.1.1).

### CU7 — Consultar trabajos cumplimentados
**Actores:** Técnico, Administrador. Listado de cumplimentados con filtros (RF06.2.1).

### CU8 — Administrar productos
**Actores:** Técnico, Administrador. ABM de productos con listado (RF07).

### CU9 — Administrar usuarios *(corregido, ampliado)*
**Actores:** Administrador. ABM de usuarios.
**Corrección C-02:** el paso *"9- Si el usuario confirma, ir a paso 9"* pasa a *"9- Si el usuario confirma, ir a paso 10, si no termina CU9"*.
**Alt. 5.1:** nombre de usuario ya existente → error, solicita otro.

**Alt. 8.1** Si el usuario a dar de baja es un técnico con órdenes activas asignadas, el sistema muestra el listado e informa que deben reasignarse antes de continuar.
**Alt. 8.2** El actor selecciona el técnico destino e ingresa el motivo de la reasignación.
**Alt. 8.3** El sistema reasigna todas las órdenes activas, registra cada una individualmente en el historial y continúa con la baja.

### CU10 — Generar informes y estadísticas
**Actores:** Administrador. Selección de período → generación del informe → exportación opcional a PDF o Excel.

### CU11 — Consultar estado de orden vía Chatbot *(nuevo)*
**Actores:** Cliente. **Precondición:** al menos una orden activa.

| Actor | Sistema |
|---|---|
| 1. Envía "estado" al Chatbot | 2. Identifica al cliente por teléfono y busca órdenes activas. 2.1 Una sola → va al paso 5. 2.2 Más de una → solicita el ID |
| 3. *(Si corresponde)* Indica el ID | 4. Valida que la orden sea del cliente. 5. Responde estado y sub-estado vigente |

**Alt. 2.1.1:** sin órdenes activas → informa que no hay órdenes en curso.
**Alt. 4.1:** ID no corresponde al cliente → informa que no se encontró y vuelve a solicitar.

### CU12 — Registrar reposición de stock *(nuevo)*
**Actores:** Administrador.

| Actor | Sistema |
|---|---|
| 1. Selecciona registrar pedido de reposición | 2. Muestra formulario con productos y stock actual |
| 3. Selecciona productos y cantidades, ingresa proveedor y fecha estimada | 4. Valida y registra en `SOLICITADO` |
| 5. Actualiza a `CONFIRMADO` cuando el proveedor confirma | 6. Registra el cambio |
| 7. Registra la recepción con cantidades recibidas | 8. Actualiza a `RECIBIDO` (o mantiene abierto si fue parcial) e incrementa el stock |

**Alt. 8.1:** recepción parcial → registra lo recibido y mantiene pendiente el saldo.

### CU13 — Consultar conversaciones del Chatbot *(nuevo)*
**Actores:** Administrador. Listado de conversaciones por cliente y orden → detalle del intercambio. Solo lectura.

### CU14 — Registrar reclamo de garantía *(nuevo)*
**Actores:** Técnico, Administrador. **Precondición:** orden cumplimentada dentro del plazo de garantía.

| Actor | Sistema |
|---|---|
| 1. Busca la orden original (ID, cliente o DNI) | 2. Muestra los datos y el estado de la garantía |
| 3. Confirma coincidencia de falla e ingresa observaciones de inspección | 4. Valida RN-06 y RN-07. 4.1 Si se cumplen → genera orden vinculada marcada "Bajo garantía". 4.2 Si no → registra el rechazo con su motivo |

### CU15 — Anular orden de trabajo *(nuevo)*
**Actores:** Administrador. **Precondición:** orden registrada y no cumplimentada.

| Actor | Sistema |
|---|---|
| 1. Busca y selecciona la orden | 2. Verifica que no esté cumplimentada. 3. Muestra los datos y solicita confirmación y motivo |
| 4. Ingresa motivo y confirma | 5. Valida motivo no vacío. 6. Cambia a `ANULADO`. 7. Registra usuario, fecha, hora y motivo. 8. Libera reservas de stock. 9. Bloquea la orden |

**Alt. 2.1:** orden cumplimentada → informa que no puede anularse.
**Alt. 5.1:** motivo vacío → solicita completarlo.

---

## 9. Reglas transversales de validación

Aplican a toda la aplicación y **deben verificarse en el backend**:

1. **Ningún endpoint confía en el frontend.** Rol, estado actual, montos calculados y disponibilidad de stock se revalidan siempre en el servidor.
2. **Toda transición de estado no listada en la sección 3 se rechaza** con error explícito.
3. **Toda orden cumplimentada es inmutable** (RN-09). Rechazar cualquier escritura sobre ella y sus entidades asociadas.
4. **Toda orden anulada es inmutable** (RF17.4).
5. **Todo cambio de estado escribe en `HistorialEstado`**, sin excepción, incluidos los automáticos (usuario `null`, `automatico = true`).
6. **Todo movimiento de stock escribe en `MovimientoStock`**, sin excepción.
7. **Las entidades de auditoría no admiten UPDATE ni DELETE.** No exponer esos endpoints.
8. **Los montos usan tipo decimal de precisión fija**, nunca punto flotante.
9. **Las fechas se almacenan con zona horaria**; los cómputos de plazos (80/90 días, vencimiento de garantía) se hacen en días corridos sobre la zona horaria local del negocio (Argentina, UTC−3).

---

## 10. Criterios de aceptación

Casos que deben pasar. Sirven como base de las pruebas automatizadas.

**Órdenes e IDs**
- Dos órdenes creadas simultáneamente reciben IDs distintos y correlativos.
- Al anular la orden `000005`, la siguiente orden creada recibe `000006`, nunca `000005`.
- Una orden de servicio técnico sin campo "Equipo" es rechazada; una de instalación sin ese campo es aceptada.
- Crear una orden de cámaras sin técnico responsable es rechazado.
- Crear una orden de servicio técnico sin técnico responsable es aceptada.

**Estados**
- Intentar pasar de `INGRESADO` directo a `ENTREGADO` es rechazado por el backend.
- Pasar a `PENDIENTE_DE_RETIRO` setea `fechaNotificacionRetiro` y encola la notificación al cliente.
- Todo cambio de estado genera exactamente un registro en `HistorialEstado`.
- Pasar a `PRESUPUESTADO` una orden sin responsable es rechazado.

**Presupuestos y stock**
- Presupuestar 5 unidades de un producto con 3 disponibles es rechazado, indicando el disponible real.
- Aprobar un presupuesto con 2 unidades incrementa `stockReservado` en 2 y no altera `stock`.
- Finalizar el trabajo decrementa `stock` y `stockReservado` en 2.
- Anular la orden libera la reserva: `stockReservado` vuelve a su valor previo, `stock` sin cambios.
- Cambiar el precio de un producto no altera el `montoTotal` de un presupuesto ya creado.
- Un presupuesto de servicio técnico no permite seleccionar productos y tiene `subtotalMateriales = 0`.

**Cumplimentación y garantía**
- Registrar cumplimentación sobre una orden en `EN_PROCESO` es rechazado.
- Registrada la cumplimentación, cualquier intento de modificar la orden es rechazado.
- Una instalación de cámaras cumplimentada genera garantía con vencimiento a 6 meses de la fecha de registro.
- Un reclamo sobre una orden con garantía vencida es rechazado.

**Vencimientos y alertas**
- El proceso diario, ejecutado dos veces en el mismo día, no duplica alertas ni mensajes.
- Al día 80 se crea una alerta `ACTIVA` visible solo para el Administrador.
- Al día 90 la orden pasa a `ABANDONADO`, se envía el mensaje final y la alerta pasa a `RESUELTA`.
- Una orden de instalación de cámaras nunca genera alertas de vencimiento.

**Permisos**
- Un Técnico que llama al endpoint de anulación recibe error de autorización, aunque la interfaz no muestre el botón.
- Un Técnico no puede acceder a informes, gestión de usuarios ni conversaciones del Chatbot.
- Un Técnico que intenta reasignar una orden que ya tiene responsable recibe error de autorización.
- Un Técnico puede autoasignarse una orden sin responsable.

**Chatbot**
- Una respuesta `CONFIRMAR`, `confirmar` o ` Confirmar ` aprueba el presupuesto.
- Una respuesta `dale` solicita reenvío en formato válido y no cambia el estado.
- Un cliente que consulta el ID de una orden ajena recibe respuesta de "no encontrada", nunca los datos.

**Asignación de técnicos**
- Dar de baja a un Técnico con órdenes activas muestra el listado y no ejecuta la baja.
- Tras la reasignación masiva, la baja se completa y cada orden tiene su registro propio de tipo `REASIGNACION_POR_BAJA`.
- Si la reasignación masiva falla a mitad de camino, ni las órdenes cambian de responsable ni el usuario queda dado de baja.
- No se permite reasignar las órdenes al mismo técnico que se está dando de baja.

---

## 11. Cambios respecto de la Rev. 4.0

Resumen para orientar la implementación sobre el código existente. El detalle operativo está en `GESTECH_CAMBIOS.md`.

| ID | Cambio | Tipo |
|---|---|---|
| C-01 | "Equipo" obligatorio solo en servicio técnico | Corrección |
| C-02 | Bug de numeración en CU9 | Corrección |
| C-03 | Validar método de pago contra RN-01 | Corrección |
| C-04 | Cierre de órdenes rechazadas (RN-10) | Corrección |
| C-05 | Proceso de reclamo de garantía (RN-12, RF15, CU14) | Funcionalidad nueva |
| C-06 | Técnico responsable e historial de asignaciones (RN-11, RF10, RNF09) — modelo mixto redefinido por `GESTECH_CAMBIOS_ASIGNACION.md` | Funcionalidad nueva |
| C-07 | Alerta interna al Administrador (RF16) | Funcionalidad nueva |
| C-08 | Anulación de órdenes en lugar de eliminación (RN-13, RF17, CU15) | Funcionalidad nueva |
| C-09 | Carga de presupuesto con productos y cálculo de montos (RF11, CU4) | Funcionalidad nueva |
| C-10 | Verificación de cliente existente (RF09, CU2) | Funcionalidad nueva |
| C-11 | Registro de reposición de stock (RF12, CU12) | Funcionalidad nueva |
| C-12 | Consulta de estado vía Chatbot (RF13, CU11) | Funcionalidad nueva |
| C-13 | Consulta de conversaciones del Chatbot (RF14, CU13) | Funcionalidad nueva |
| C-14 | Trazabilidad y auditoría (RNF09) | Funcionalidad nueva |

**Descartado explícitamente** (no implementar): código QR por orden; proveedor como actor del sistema; caso de uso separado para elaborar presupuesto; multi-sucursal, multi-depósito o ubicaciones de stock; cuenta corriente o pagos parciales; portal web para clientes; roles distintos de Administrador y Técnico.

---

## 12. Pendientes — preguntar antes de implementar

Seis puntos no están definidos en la documentación y no deben resolverse por cuenta propia.

**P-01 — Datos del negocio para el comprobante.** RF03.3 exige nombre, CUIT, teléfono, email y dirección del negocio, pero esos valores no están en ninguna parte. Definir si se cargan como configuración del sistema o se fijan en código.

**P-02 — Días y horarios de atención.** RF05.3 exige incluirlos en la notificación de retiro. No están especificados.

**P-03 — Formato del número de comprobante.** RF03.3 lo exige pero no define formato ni si debe cumplir algún requisito fiscal. Se asume correlativo simple salvo indicación contraria.

**P-04 — Tipo de garantía en servicio técnico.** RN-05 distingue 30 días (mantenimiento y software) de 90 días (reparaciones electrónicas y hardware), pero el tipo de servicio registrado en la orden no permite deducir cuál corresponde. Confirmar que el técnico lo elige manualmente al cumplimentar (asunción actual) o si debe derivarse de otro dato.

**P-05 — Umbral de la alerta por orden sin asignar.** RF16.6 propone 7 días. Valor a confirmar con el equipo.

**P-06 — Técnico destino de la reasignación masiva.** Se asume un único técnico destino para todas las órdenes. Confirmar si debe poder repartirse entre varios.
