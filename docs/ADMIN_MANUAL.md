# Manual del administrador — versión de pruebas

**Identidad:** asignar o revocar IA Workforce desde el SSO de Bodegas Esmeralda. Confirmar el `sub` confiable y crear su membresía activa/rol en la base de esta aplicación. Nunca duplicar contraseñas. Los roles del backend son admin, supervisor, process_owner, operator, viewer y auditor; los permisos se verifican en cada operación. La vinculación automática de usuarios/roles con el panel SSO es pendiente.

**Agentes:** registrar un agente desde la interfaz solo crea su ficha en estado `draft`. Se puede pausar, activar o deshabilitar y crear nuevas versiones de instrucciones. Para agregar una herramienta se necesita código auditado y autorización fuera de prompts. La sola creación del agente **no desarrolla** procesos de otras áreas.

**Integraciones:** visualizar estado en el módulo correspondiente. Los secretos de Cloudflare no son visibles. Graph y Loyal no deben habilitarse sin pruebas. El mapeo CSV real se configura en `erp_csv_mappings` y debe incluir nombre, versión y aprobación humana.

**Observabilidad y errores:** consultar eventos de auditoría y ejecuciones. Ante `DOCUMENT_NOT_FAILED` no reprocesar por fuerza. Si hay error de extracción, puede solicitarse reprocesamiento controlado desde la API, hasta el límite fijado. En alta carga, inspeccionar Queue, Workflow y DLQ usando herramientas de Cloudflare y verificar integridad de R2 / DB.

**Backups y recuperación:** configurar snapshots/backup de PostgreSQL, versionado y política de lifecycle de R2, definir RPO/RTO y ensayar restauración antes de producción. El código no instala por sí solo estas políticas.

**Seguridad:** MFA de admins, revocación de sesiones, controles por bodega/proceso, retención, malware, incidentes y gobierno de datos deben ser acordados con Seguridad y Legal antes del despliegue.

## EXPO AI Agent (noviembre 2026)

- **Agentes de IA → métricas reales** del agente de OC: procesadas, para revisar, bloqueadas, errores, tiempo promedio, tokens (los estimados se señalan), costo (solo si hay precios en `ai_model_prices`) y nivel de extracción usado.
- **Presupuestos de tokens** (por documento, día y mes): se editan en el panel lateral; cada cambio queda en Auditoría. Si se supera, no se llama a la IA y la OC queda para revisión humana.
- **Consultar buzón ahora**: dispara una lectura manual (además del cron de cada minuto). Si Graph no está configurado, responde que faltan credenciales.
- **Integraciones → CSV Worknet (22 columnas)**: muestra el historial oficial cargado. "Registrar prueba de importación" se usa solo después de importar en Worknet un CSV generado por la plataforma, con evidencia (quién, cuándo, resultado). Habilita el CSV definitivo y queda auditado.
- Para mejorar el borrador, importar en **Fuentes comerciales** los CSV Worknet históricos de cada cliente: de ahí salen destino, condición, lista, contenedor, incoterm, nombre corto y cajas por pallet.
- Despliegue y vuelta atrás: `docs/EXPO_DEPLOY_ROLLBACK.md`. Estado y pruebas: `docs/EXPO_AI_AGENT_ESTADO.md`.
