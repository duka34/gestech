CREATE TABLE `alertas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`orden_id` text NOT NULL,
	`mensaje` text NOT NULL,
	`fecha_generacion` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`estado` text DEFAULT 'ACTIVA' NOT NULL,
	FOREIGN KEY (`orden_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `asignacion_tecnico` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orden_id` text NOT NULL,
	`tecnico_asignado_id` integer NOT NULL,
	`tecnico_anterior_id` integer,
	`fecha_hora` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`usuario_responsable_id` integer NOT NULL,
	FOREIGN KEY (`orden_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tecnico_asignado_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tecnico_anterior_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_responsable_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`apellido` text NOT NULL,
	`dni` text NOT NULL,
	`telefono` text NOT NULL,
	`domicilio` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_dni_unique` ON `clientes` (`dni`);--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_telefono_unique` ON `clientes` (`telefono`);--> statement-breakpoint
CREATE TABLE `comprobantes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero_comprobante` text NOT NULL,
	`cumplimentacion_id` integer NOT NULL,
	`fecha_emision` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`total` real NOT NULL,
	`archivo_pdf` text,
	FOREIGN KEY (`cumplimentacion_id`) REFERENCES `cumplimentaciones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comprobantes_numero_comprobante_unique` ON `comprobantes` (`numero_comprobante`);--> statement-breakpoint
CREATE UNIQUE INDEX `comprobantes_cumplimentacion_id_unique` ON `comprobantes` (`cumplimentacion_id`);--> statement-breakpoint
CREATE TABLE `conversaciones_chatbot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`orden_id` text,
	`direccion` text NOT NULL,
	`contenido` text NOT NULL,
	`fecha_hora` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`orden_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cumplimentaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orden_id` text NOT NULL,
	`fecha_realizacion` text NOT NULL,
	`descripcion_tareas` text NOT NULL,
	`tecnico_ejecutor_id` integer NOT NULL,
	`monto_cobrado` real NOT NULL,
	`metodo_pago` text NOT NULL,
	`tipo_garantia` text NOT NULL,
	`fecha_registro` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`orden_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tecnico_ejecutor_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cumplimentaciones_orden_id_unique` ON `cumplimentaciones` (`orden_id`);--> statement-breakpoint
CREATE TABLE `detalle_presupuesto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`presupuesto_id` integer NOT NULL,
	`producto_id` integer NOT NULL,
	`cantidad` integer NOT NULL,
	`precio_unitario` real NOT NULL,
	`subtotal` real NOT NULL,
	FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuestos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `detalle_reposicion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reposicion_id` integer NOT NULL,
	`producto_id` integer NOT NULL,
	`cantidad_solicitada` integer NOT NULL,
	`cantidad_recibida` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`reposicion_id`) REFERENCES `reposiciones_stock`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `garantias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cumplimentacion_id` integer NOT NULL,
	`tipo_garantia` text NOT NULL,
	`plazo_dias` integer NOT NULL,
	`fecha_inicio` text NOT NULL,
	`fecha_vencimiento` text NOT NULL,
	FOREIGN KEY (`cumplimentacion_id`) REFERENCES `cumplimentaciones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garantias_cumplimentacion_id_unique` ON `garantias` (`cumplimentacion_id`);--> statement-breakpoint
CREATE TABLE `historial_estado` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orden_id` text NOT NULL,
	`estado_anterior` text,
	`estado_nuevo` text NOT NULL,
	`fecha_hora` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`usuario_id` integer,
	`automatico` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`orden_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `movimiento_stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`producto_id` integer NOT NULL,
	`tipo_movimiento` text NOT NULL,
	`cantidad` integer NOT NULL,
	`orden_id` text,
	`fecha_hora` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`usuario_id` integer,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`orden_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ordenes_trabajo` (
	`id` text PRIMARY KEY NOT NULL,
	`cliente_id` integer NOT NULL,
	`tipo_servicio` text NOT NULL,
	`equipo` text,
	`cantidad_camaras` integer,
	`descripcion_trabajo` text NOT NULL,
	`fecha_ingreso` text NOT NULL,
	`observaciones` text,
	`estado` text NOT NULL,
	`sub_estado` text,
	`tecnico_responsable_id` integer,
	`fecha_notificacion_retiro` text,
	`orden_original_id` text,
	`bajo_garantia` integer DEFAULT false NOT NULL,
	`motivo_anulacion` text,
	`fecha_anulacion` text,
	`creado_en` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tecnico_responsable_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`orden_original_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `presupuestos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orden_id` text NOT NULL,
	`detalle` text NOT NULL,
	`monto_mano_obra` real NOT NULL,
	`subtotal_materiales` real DEFAULT 0 NOT NULL,
	`monto_total` real NOT NULL,
	`fecha_creacion` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`estado` text DEFAULT 'PENDIENTE' NOT NULL,
	`fecha_respuesta_cliente` text,
	FOREIGN KEY (`orden_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presupuestos_orden_id_unique` ON `presupuestos` (`orden_id`);--> statement-breakpoint
CREATE TABLE `productos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`categoria` text NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`stock_reservado` integer DEFAULT 0 NOT NULL,
	`stock_minimo` integer DEFAULT 0 NOT NULL,
	`precio` real DEFAULT 0 NOT NULL,
	`activo` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reclamos_garantia` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orden_original_id` text NOT NULL,
	`orden_generada_id` text,
	`fecha_reclamo` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`observaciones_inspeccion` text NOT NULL,
	`resultado` text NOT NULL,
	`motivo_rechazo` text,
	`usuario_registro_id` integer NOT NULL,
	FOREIGN KEY (`orden_original_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`orden_generada_id`) REFERENCES `ordenes_trabajo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_registro_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `registro_auditoria` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo_operacion` text NOT NULL,
	`entidad_afectada` text NOT NULL,
	`id_entidad` text NOT NULL,
	`descripcion` text NOT NULL,
	`fecha_hora` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`usuario_id` integer NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reposiciones_stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proveedor` text NOT NULL,
	`fecha_pedido` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`fecha_estimada_recepcion` text,
	`estado` text DEFAULT 'SOLICITADO' NOT NULL,
	`usuario_registro_id` integer NOT NULL,
	FOREIGN KEY (`usuario_registro_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `secuencias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orden_seq` integer DEFAULT 0 NOT NULL,
	`comprobante_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`apellido` text NOT NULL,
	`nombre_usuario` text NOT NULL,
	`contrasena` text NOT NULL,
	`rol` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_nombre_usuario_unique` ON `usuarios` (`nombre_usuario`);