# IA Workforce · Órdenes de compra · Microsoft 365 + Supabase

## Estado real, 19 noviembre 2026

- Base Supabase existente **compras_erp_2025_2026** reactivada y migración `oc_worknet_mail_loyal_initial` aplicada y verificada.
- El módulo conserva originales EML y adjuntos PDF, XLSX, XLS y CSV en el bucket R2 ya existente `ia-workforce-docs-private`, cuando se autorice el buzón.
- Trae lectura incremental de Microsoft Graph **Mail.Read** (delta), control de duplicados por identificador de mensaje y adjunto, historial de sincronización y Cron cada 4 horas.
- Trae tablero de recepción y OC, importador de CSV históricos compatible con 22 columnas de Worknet; las nuevas OC quedan bloqueadas.
- **No** incluye todavía extracción semántica de PDF/XLSX a líneas de Worknet, integración real de Loyal, ni SSO corporativo. La exportación se encuentra **bloqueada por seguridad** hasta completar Loyal y revisión humana.
- **No se desplegó** este paquete ni se sustituyó `quilsoft-ia-workforce`. Es un módulo aislado para publicar en un Worker distinto, probar y después integrar al proyecto existente con revisión de código.

## Cloudflare: Worker aislado para no reemplazar producción

El archivo `wrangler.jsonc` crea el Worker `oc-worknet-m365-supabase`; **no** usa el nombre `quilsoft-ia-workforce` ni modifica sus recursos preexistentes. Reutiliza el bucket R2 ya verificado. Cloudflare Build de Git requiere un token de usuario activo.

Comandos en la carpeta del proyecto:

```powershell
npm install
npm test
npx wrangler login
npx wrangler deploy
```

**Antes de desplegar, configurar secretos en el Worker nuevo** (nunca guardar secretos en Git):

```powershell
npx wrangler secret put M365_TENANT_ID
npx wrangler secret put M365_CLIENT_ID
npx wrangler secret put M365_CLIENT_SECRET
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put ADMIN_API_TOKEN
```

`ADMIN_API_TOKEN`: cadena aleatoria fuerte de al menos 32 caracteres. Es solo acceso técnico al MVP. Para empleados de producción, sustituir por integración con `besa-identidad-central` y autorización por roles; no usar una contraseña compartida.

La variable pública `SUPABASE_URL` ya se encuentra en `wrangler.jsonc`; apuntará a `https://wptqxlkpsliexnwpncng.supabase.co`.

El secreto `SUPABASE_SERVICE_KEY` se obtiene del proyecto Supabase **solo para el servidor**. Nunca ponerlo en el frontend ni en Git. Si se desea aprovechar la autenticación central, el Worker debe validar la sesión de BESA antes de dar acceso a datos.

### Microsoft Entra ID / Exchange Online: trabajo requerido por IT

1. Registrar una app de tipo confidencial en el tenant del dominio `catenazapata.com`.
2. Dar permiso de aplicación **Microsoft Graph > Mail.Read** y consentimiento administrativo (no `Mail.ReadWrite` ni `Mail.Send`).
3. Limitar el permiso de aplicación al buzón `exportorders@catenazapata.com` mediante Exchange Online **Application RBAC** o el mecanismo equivalente admitido por su tenant, y comprobar que no pueda leer otros buzones.
4. Crear secreto o credencial autorizada y proporcionar Tenant ID, Client ID y secreto **vía secretos de Cloudflare**, nunca por chat o Git.
5. Verificar que `exportorders@catenazapata.com` existe como buzón y admite ese acceso.
6. Probar en `/api/mail/status`, luego `POST /api/mail/sync`. Un Cron lo consultará cada cuatro horas.

> Importante: `Mail.Read` como permiso de aplicación, sin restricción de Exchange, puede leer múltiples buzones de la organización. Restringir el scope *antes* de habilitar el lector. Además, Mail.Read permite al conector técnicamente consultar mensajes, pero nuestro código no hace requests de escritura, envío ni eliminación.

### Loyal

No se inventa un estado `approved`. Hay que recibir de IT/Loyal el endpoint de consulta por código de producto, su autenticación y los estados de aprobación. Hasta entonces, todas las líneas conservan `loyal_status = unknown` y se impide exportar a Worknet.

### Supabase

Proyecto existente: `compras_erp_2025_2026` / ref `wptqxlkpsliexnwpncng` (plan organización Pro). Las tablas `oc_worknet_*` se crearon en este proyecto sin tocar `ordenes_compra`, `proveedores` ni otros módulos. El SQL reproducible está en `sql/001_schema.sql`. Evitar ejecutarlo repetidamente en otra base sin revisar previamente.

El backend utiliza exclusivamente la REST API de Supabase con clave privada; las tablas nuevas tienen RLS habilitada y privilegios revocados para `anon` y `authenticated`.

### Endpoints

- `GET /api/health`: diagnóstico de configuración sin secretos.
- `GET /api/mail/status`: historial/estados del buzón.
- `POST /api/mail/sync`: consulta manual del buzón.
- `GET /api/orders`: lista de órdenes ingresadas.
- `GET /api/orders/:uuid`: detalle de una OC.
- `POST /api/import-csv`: importa CSV históricos en formato Worknet.
- `GET /api/orders/:uuid/download`: bloqueada (409) hasta integración real Loyal + aprobación humana.

Los endpoints operativos exigen temporalmente `Authorization: Bearer <ADMIN_API_TOKEN>`.

## Limitaciones conscientes

- Las OC enviadas por correo quedan almacenadas, pero **no se convierten automáticamente** en CSV hasta agregar extractor y reglas por cliente. El MVP actual sirve para comprobar recepción y corpus de entrenamiento.
- Archivos individuales y correo original: límite actual de 8 MB; tamaños mayores quedan en error registrado y se reintentan, requiriendo ampliación controlada.
- Si una importación CSV falla a mitad, puede quedar una OC con líneas incompletas: revisar antes de reintentar. La versión productiva debe usar transacciones RPC en Supabase.
- El botón de consulta manual del buzón es una operación administrativa; restringirlo a IT y aplicar rate limits.
- La interfaz es de prueba; la integración final al SSO y permisos por rol de BESA aún es necesaria.
- No se modificaron Deployments, Workers de producción ni secretos existentes.

## Corrección Cloudflare Builds, 19/11/2026

El error `Script not found "build"` queda corregido mediante `npm run build` en package.json; este script comprueba sintaxis y ejecuta pruebas. No genera un directorio `dist`, dado que Wrangler despliega `src/index.js` directamente.

Para el Worker **nuevo y separado** `oc-worknet-m365-supabase` utilizar en Cloudflare Builds:
- Root directory: `/` (si package.json está en la raíz del repositorio).
- Build command: `npm run build`.
- Deploy command: `npx wrangler deploy`.

No utilizar en este repositorio el comando anterior `node -e "$D1_PATCH_JS" && printf '%s' "$IAWF_FIX_1$IAWF_FIX_2" | base64 -d | tar -xz && node -e "$IAWF_APP_PATCH_JS" && bun run build`: corresponde a modificaciones anteriores y ejecuta código desde variables de entorno. Comprobar que el proyecto de Builds esté conectado al repositorio y al Worker **nuevo**, no a `quilsoft-ia-workforce`. No borrar ni modificar los recursos de producción previos.
