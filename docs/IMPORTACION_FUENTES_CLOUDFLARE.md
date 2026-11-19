# Fuentes comerciales en D1 (Cloudflare)

Se conservan todas las funcionalidades originales (SSO, agente, Workflow, R2, Queues y órdenes).

## Importar fuentes recibidas

El esquema está en `infra/cloudflare/migrations/0002_commercial_sources.sql`. La carga de los archivos está en **`IA_WORKFORCE_CARGA_PRIVADA_D1.sql` (entregado por separado, NO agregar a GitHub)**; contiene el CSV WINEBOW (9 líneas) y las seis hojas del Excel comercial. Los registros son referencias de SOLO LECTURA, no órdenes aprobadas ni datos inferidos.

1. Crear respaldo de D1 antes de aplicar la migración.
2. Desde Git Bash, en la raíz del repositorio, ejecutar la migración de esquema y después la carga privada descargada en la carpeta Descargas:

```bash
npx wrangler d1 execute ia-workforce-catena-db --remote --file=infra/cloudflare/migrations/0002_commercial_sources.sql
npx wrangler d1 execute ia-workforce-catena-db --remote --file="$HOME/Downloads/IA_WORKFORCE_CARGA_PRIVADA_D1.sql"
```

3. Verificar:

```bash
npx wrangler d1 execute ia-workforce-catena-db --remote --command="SELECT filename,sheet_name,(SELECT COUNT(*) FROM workforce_import_rows r WHERE r.source_id=s.id) filas FROM workforce_import_sources s"
```

4. Compilar: `npm ci && npm run build`. Publicar cambios mediante `git add`, `git commit`, `git push`.
5. Entrar con SSO a **Fuentes comerciales**. Los usuarios necesitan permiso `orders.read`.

La carga privada usa INSERT OR IGNORE; una segunda ejecución NO duplica filas. No elimina registros existentes.

## Diagnóstico del agente

La página Agentes incluye un resumen de bindings y ejecuciones, protegido por `agents.read`. Que un binding esté presente no prueba inferencia funcional. El botón «Probar conexión real con Workers AI» efectúa una inferencia breve, guarda evidencia de ejecución y requiere permiso `admin.agent`. Probar también con un documento de muestra desde una orden de prueba y comprobar la cola, Workflow, extracción y ejecuciones. Los archivos comerciales no se envían al ERP ni se usan para aprobaciones automáticas.

## Limitaciones

- `Dashboard Reporte de Ventas ME(2).xlsx` es un ranking comercial histórico, no una tabla de órdenes de compra.
- `WINEBOW_11-11(2).csv` contiene 9 líneas de 2 códigos de OC; no se convierte automáticamente en una orden para no asumir la semántica de sus campos.
- Microsoft 365 y Loyal siguen requiriendo conexiones y pruebas independientes.
- Los archivos originales no se hacen públicos: los datos se consultan en D1 mediante API con sesión BESA y permisos.

**Confidencialidad:** no subir `IA_WORKFORCE_CARGA_PRIVADA_D1.sql` al repositorio GitHub. Si los datos se usan en producción, controlar acceso por SSO y `orders.read`.
