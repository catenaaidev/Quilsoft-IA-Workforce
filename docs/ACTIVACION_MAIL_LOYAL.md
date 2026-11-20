# Activación sin rehacer IA Workforce (Cloudflare)

La aplicación mantiene D1, R2, Queues, Workflow, Workers AI y BESA SSO. El correo y Loyal no pueden considerarse operativos hasta completar las credenciales y pruebas autorizadas.

## Microsoft 365 / Entra ID

TI debe proporcionar: ID de tenant, ID de aplicación registrada, secreto de cliente (solo en Wrangler secrets), dirección exacta del buzón de OC, consentimiento de aplicación para **Mail.Read** restringido a ese buzón (Exchange Application RBAC o política de acceso equivalente), y una OC de ensayo con adjunto PDF o XLSX. Configurar `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_MAILBOX` como secretos de Worker (no en Git).

El cron del Worker corre cada 10 minutos: cuando las cuatro variables están presentes, obtiene token de Graph mediante client_credentials, lee incrementalmente el Inbox y guarda adjuntos en R2 y órdenes en D1. No envía correos ni escribe en Worknet. Validar Graph token, permisos de buzón, recepción de un mensaje de ensayo, registro D1, adjunto R2 y ejecución del Workflow. Mientras no se configure, la recepción automática está desactivada.

## Loyal

No inventar endpoints. Solicitar API oficial de consulta por código y un ejemplo JSON real con `productCode`, `status`, opcional `stage` y `updatedAt`; definir los valores de estados y el valor exacto de ficha aprobada. El adaptador incluido funciona por **GET** sobre una URL oficial HTTPS que contenga `{sku}`; autenticación `Bearer` y JSON. Si Loyal emplea otro contrato, adaptar el conector a su documentación antes de activarlo.

Configurar como secretos `LOYAL_LOOKUP_URL_TEMPLATE`, `LOYAL_READ_TOKEN`, `LOYAL_APPROVED_VALUE`. En producción, sin los tres valores, la ficha queda en estado `unknown` y ninguna orden se aprueba por una simulación. La reconsulta automática se programa cada cuatro horas, consultando órdenes en revisión o bloqueadas (máximo 100 por ejecución, sujeto a crecimiento/optimización). Una respuesta inválida o error de conexión también deja la ficha en `unknown`, no equivale a sin ficha. Una ficha aprobada por Loyal nunca elimina el paso de aprobación humana.

## Pruebas de aceptación

1. Un correo de ensayo crea una sola OC (no duplicados al volver a consultar).
2. El adjunto original se conserva en R2 y la IA registra extracción o error revisable.
3. Falta de código de producto, error de Loyal o ficha pendiente bloquean la OC.
4. Loyal responde fichas aprobadas para **todos** los códigos y habilita revisión humana; jamás descarga directa.
5. La revisión humana valida y descarga CSV en formato Worknet comprobado de 22 columnas. Sebastián realiza la importación manual.
6. SSO, roles y auditoría persisten. No se envía correo, no se aprueba Loyal y no se escribe en ERP.

## Despliegue seguro

Aplicar el ZIP a la carpeta raíz conservando `.git`, ejecutar `npm ci && npm run build`, probar con datos sintéticos y desplegar con `npx wrangler deploy`. No publicar los secretos ni prometer integración habilitada antes del consentimiento de TI y contrato Loyal.
