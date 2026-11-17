# Manual del administrador — versión de pruebas

**Identidad:** asignar o revocar IA Workforce desde el SSO de Bodegas Esmeralda. Confirmar el `sub` confiable y crear su membresía activa/rol en la base de esta aplicación. Nunca duplicar contraseñas. Los roles del backend son admin, supervisor, process_owner, operator, viewer y auditor; los permisos se verifican en cada operación. La vinculación automática de usuarios/roles con el panel SSO es pendiente.

**Agentes:** registrar un agente desde la interfaz solo crea su ficha en estado `draft`. Se puede pausar, activar o deshabilitar y crear nuevas versiones de instrucciones. Para agregar una herramienta se necesita código auditado y autorización fuera de prompts. La sola creación del agente **no desarrolla** procesos de otras áreas.

**Integraciones:** visualizar estado en el módulo correspondiente. Los secretos de Cloudflare no son visibles. Graph y Loyal no deben habilitarse sin pruebas. El mapeo CSV real se configura en `erp_csv_mappings` y debe incluir nombre, versión y aprobación humana.

**Observabilidad y errores:** consultar eventos de auditoría y ejecuciones. Ante `DOCUMENT_NOT_FAILED` no reprocesar por fuerza. Si hay error de extracción, puede solicitarse reprocesamiento controlado desde la API, hasta el límite fijado. En alta carga, inspeccionar Queue, Workflow y DLQ usando herramientas de Cloudflare y verificar integridad de R2 / DB.

**Backups y recuperación:** configurar snapshots/backup de PostgreSQL, versionado y política de lifecycle de R2, definir RPO/RTO y ensayar restauración antes de producción. El código no instala por sí solo estas políticas.

**Seguridad:** MFA de admins, revocación de sesiones, controles por bodega/proceso, retención, malware, incidentes y gobierno de datos deben ser acordados con Seguridad y Legal antes del despliegue.
