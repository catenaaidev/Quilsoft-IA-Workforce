# EXPO AI Agent — despliegue y vuelta atrás

Worker: `quilsoft-ia-workforce` · D1: `ia-workforce-catena-db` · R2: `ia-workforce-docs-private`.
**Cada paso remoto requiere autorización explícita.** Ningún comando toca otros Workers ni sobrescribe secretos.

## Qué cambia en producción

- Migración `0007_ai_metrics_worknet.sql`: **solo aditiva** (`ALTER TABLE … ADD COLUMN`, tablas nuevas,
  `INSERT OR IGNORE`). No borra ni modifica datos existentes.
- Cron: de cada 10 minutos a cada minuto. Sin las cuatro credenciales de Graph el cron no consulta ni registra nada.
- Código del Worker y del frontend.

## 1. Respaldo previo

PowerShell:
```powershell
cd "D:\Proyectos\Implementación Quilsoft IA Workforce\IA_WORKFORCE_CATENA_ZAPATA_COMPLETO"
npx wrangler deployments list
npx wrangler d1 time-travel info ia-workforce-catena-db
npx wrangler d1 export ia-workforce-catena-db --remote --output "respaldo-d1-$(Get-Date -Format yyyyMMdd-HHmm).sql"
```

Git Bash:
```bash
cd "/d/Proyectos/Implementación Quilsoft IA Workforce/IA_WORKFORCE_CATENA_ZAPATA_COMPLETO"
npx wrangler deployments list
npx wrangler d1 time-travel info ia-workforce-catena-db
npx wrangler d1 export ia-workforce-catena-db --remote --output "respaldo-d1-$(date +%Y%m%d-%H%M).sql"
```

Anotar el **ID de la versión actual** y el **bookmark** de Time Travel. El respaldo `.sql` contiene datos:
guardarlo fuera del repositorio y del ZIP.

## 2. Verificación local (no publica nada)

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npx wrangler deploy --dry-run --outdir .deploy-check
```

## 3. Migración y despliegue

```powershell
# IMPORTANTE: producción NO tiene la tabla d1_migrations (0001–0006 se aplicaron a mano).
# NO usar "migrations apply --remote": volvería a correr 0001–0006 sobre los datos.
# Aplicar solo el archivo nuevo:
npx wrangler d1 execute ia-workforce-catena-db --remote --file infra/cloudflare/migrations/0007_ai_metrics_worknet.sql
npx wrangler deploy
```
(Git Bash: los mismos comandos con `npm` en lugar de `npm.cmd`.)

## 4. Comprobaciones después del deploy

1. Abrir la URL e ingresar por BESA (el SSO no cambia).
2. Panel → "Qué hacer ahora" y estado de integraciones: correo **pendiente** hasta que IT cargue credenciales.
3. Agentes de IA → métricas y presupuestos visibles.
4. Integraciones → bloque "CSV Worknet (22 columnas)" con el historial importado.
5. `npx wrangler tail quilsoft-ia-workforce` durante 2 minutos: sin errores. Con credenciales de Graph, `mail_poll_runs` suma una fila por minuto.

## 5. Vuelta atrás

Código (inmediato):
```powershell
npx wrangler rollback <ID_DE_VERSION_ANTERIOR> --message "Vuelta atrás EXPO"
# Deploy del 24/11/2026: versión anterior = 6975e925-c2d9-4bfc-8048-28d0ccbc2165
```

Base de datos: la migración 0007 es aditiva y el código anterior ignora las columnas y tablas nuevas,
así que **normalmente no hace falta revertirla**. Solo si fuera imprescindible:
```powershell
npx wrangler d1 time-travel restore ia-workforce-catena-db --bookmark <BOOKMARK_ANOTADO>
```
Atención: restaurar con Time Travel descarta también las OC recibidas después del bookmark.

## 6. Activación de integraciones (cuando IT las entregue)

```powershell
npx wrangler secret put GRAPH_TENANT_ID
npx wrangler secret put GRAPH_CLIENT_ID
npx wrangler secret put GRAPH_CLIENT_SECRET
npx wrangler secret put GRAPH_MAILBOX
```
`wrangler secret put` crea o reemplaza **solo** el secreto indicado. Verificar antes con
`npx wrangler secret list` para no sobrescribir uno existente sin querer. Los valores se escriben en la
consola, nunca en archivos ni en el repositorio.
