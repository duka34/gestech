ALTER TABLE `asignacion_tecnico` ADD `motivo` text;--> statement-breakpoint
ALTER TABLE `asignacion_tecnico` ADD `tipo_asignacion` text DEFAULT 'INICIAL' NOT NULL;