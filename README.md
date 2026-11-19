# OC Worknet / Loyal — MVP técnico (no productivo)

Este repositorio contiene un **MVP ejecutable para Cloudflare Workers + D1**. Implementa importación controlada de CSV Worknet, almacenamiento y desglose de órdenes, deduplicación por número de OC, corrección de líneas, historial de auditoría, dashboard y bloqueo estricto de revisión/descarga mientras no exista evidencia real de aprobación en Loyal.

**NO es el producto completo**. No interpreta aún OC originales PDF/Excel, no consulta correo ni Loyal y no permite descargar OC de la base hasta que el proveedor habilite una integración verificable. No se comunica con Worknet ni envía correos. No incluye datos reales ni aprobaciones ficticias.

## Estado funcional

| Componente | Estado |
| --- | --- |
| Parseo CSV con 22 encabezados, `;`, comas decimales y formato de fechas | Implementado |
| Conservación de CSV fuente en D1 y líneas por OC | Implementado (para MVP) |
| Bloqueo conservador por estado de ficha desconocido | Implementado |
| Historial por actor y versión de corrección | Implementado |
| Tabla editable y revocación de revisión tras modificar | Implementado |
| Descarga CSV con orden de columnas exacto | Implementado, **bloqueada** sin verificación de Loyal |
| Correo empresarial de solo lectura | Pendiente de credenciales/contrato de API |
| OCR y extracción de órdenes PDF/Excel | Pendiente de muestras reales |
| Consulta Loyal, sincronización 4h y desbloqueo verificado | Interfaz deshabilitada hasta obtener API autorizada |
| OAuth SSO, roles, permisos y almacenamiento empresarial de documentos | Pendiente antes de producción |
| Maestros y Allocations, detección inteligente de correspondencias | Pendiente de archivos/validación |
| Carga Worknet, escritura Loyal, envío de correos | Prohibido por diseño |

## Puesta en marcha

- Preparar un proyecto Workers usando la CLI **cf** de Cloudflare (comprobar su versión actual) y configurar el entrypoint `src/index.js`.
- Crear una base D1 propia y vincularla al Worker mediante el nombre de binding **DB**. Ejecutar `migrations/0001_init.sql` contra esa D1 de desarrollo.
- Configurar el secreto **ACCESS_TOKEN** con valor aleatorio de 24 caracteres o más. En ausencia de este valor, todo el API de datos devuelve 401.
- Publicar el Worker en un entorno **de pruebas protegido**, ejecutar las rutas `/` y `/api/health`, y abrir el panel con el mismo token. No usar token estático compartido en producción: reemplazarlo por SSO/MFA y autorización por rol.
- Importar `fixtures/WINEBOW_11-11.csv`; luego observar las 9 líneas y el bloqueo por fichas desconocidas.
- La función `scheduled` está presente como **placeholder**, no consulta Loyal. No configurar el Cron Trigger como una sincronización funcional hasta implementar el cliente API de solo lectura.

El acceso a D1 y el secreto dependen de la configuración real del account de Cloudflare; **este ZIP no despliega ni crea recursos por sí solo**. El proyecto no necesita Supabase para el MVP si se usa D1. Si ya existe Supabase corporativo y conviene reutilizarlo, revisar políticas y conexiones antes de modificar la arquitectura.

## Requisitos externos para completar la aplicación

1. Buzón M365 o Google Workspace dedicado, alta OAuth de lectura y administrador responsable. Sin permisos de envío, borrado ni modificación.
2. Contrato/documentación autorizada de la API Loyal: endpoint, autenticación, mapeo de productos y estados, límites de consulta y modalidad para leer ficha/fecha de aprobación.
3. Órdenes de compra originales en PDF/Excel más los CSV finales asociados para evaluar exactitud.
4. Allocations y maestros Worknet, sus códigos de cliente, depósitos, condiciones y productos, con versiones oficiales.
5. Confirmación de la equivalencia de lista `043` del Excel comercial versus `43` del CSV Worknet, y de la alternativa `543`.
6. Vinculación con el SSO corporativo y matriz real de roles con acceso revocable.
7. Definición de retención, cifrado, almacenamiento de originales y auditoría para despliegue productivo.

## Notas de seguridad

- No se expone una API para poner manualmente `loyal_status=approved`.
- Los intentos de exportar o revisar líneas sin aprobación real terminan en 409.
- Los archivos se importan solo desde el dispositivo del operador en el MVP, sin correo asociado.
- No se debe exponer el panel usando el secreto de pruebas en producción.
- El importador rechaza OC repetidas de forma conservadora: no fusiona silenciosamente modificaciones del cliente.
