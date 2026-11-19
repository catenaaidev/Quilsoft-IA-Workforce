# Reparacion de Cloudflare Builds - IA Workforce - 19/11/2026

## Diagnostico verificado en la cuenta Cloudflare

- Worker: `quilsoft-ia-workforce`, version activa `e95dbdd7` (100%). No reemplazar sin verificar.
- Compilaciones de GitHub fallan por `npm ci`: falta sincronizar el `package-lock.json` remoto con los manifiestos actuales (entre otros, `vitest`).
- Otras compilaciones de GitHub fallaron por no encontrar el script `build` en la raiz.
- Otra compilacion fallo con Cloudflare 10064 porque no exportaba `PurchaseAgent`.
- Un intento manual fallo al actualizar el repositorio de GitHub (no era un fallo de TypeScript).

## Estado de este ZIP

- Incluye monorepo completo con `package.json`, `package-lock.json`, `apps`, `packages`, `integrations` e `infra`.
- El lockfile coincide a nivel de manifiestos con todos los workspaces.
- `wrangler.jsonc` raiz conserva `PurchaseAgent`, `PurchaseWorkflow`, D1, R2, queue, servicio de identidad y assets.
- La integracion OC/Supabase se encuentra separada en `integrations/oc-m365-supabase`, con Worker propio `oc-worknet-m365-supabase`. NO desplegarla usando el proyecto de Builds de Workforce.
- La plataforma principal usa D1; NO esta migrada a Supabase. La integracion OC esta preparada para conectarse a Supabase mediante secreto en su Worker independiente.

## Publicacion correcta del repositorio principal

1. Descomprimir este ZIP y reemplazar la estructura de archivos de la rama `main` del repositorio `catenaaidev/Quilsoft-IA-Workforce` (no subir el ZIP como un unico archivo).
2. Hacer commit incluyendo tanto `package.json` como `package-lock.json`, las carpetas `apps`, `packages`, `integrations`, `infra`, `scripts` y `wrangler.jsonc` raiz.
3. En Cloudflare Builds, Worker `quilsoft-ia-workforce`: root `/`, build `npm run build`, deploy `npx wrangler deploy`. No usar comandos de parches por variables de entorno.
4. Antes de desplegar: `npm ci`, `npm run build`, `npm test`, `npm run deploy:check` con conectividad npm. No forzar deploy si fallan.
5. Revisar que la compilacion finalice correctamente y que el despliegue exporte ambas clases existentes, sin migraciones destructivas.
6. Verificar `/api/health`, login, rutas protegidas, procesamiento y escritura en D1 sin datos reales de prueba innecesarios.
7. Desplegar y configurar `oc-worknet-m365-supabase` por separado solo tras validar secretos, permisos de Graph por buzon, SSO y revisiones de seguridad.

## Pruebas realizadas durante esta revision

- `python scripts/verify_package.py`: correcto (12 controles, 0 errores).
- Contraste de manifiestos raiz y workspaces con package-lock: correcto.
- `node --test integrations/oc-m365-supabase/tests/*.test.mjs`: 3/3.
- `python -m pytest services/document-processor/tests -q`: 7/7.
- `npm ci`: NO completado en este entorno por la descarga de dependencias; no equivale a una verificacion de build.
- Pruebas del dominio: no ejecutables sin compilar previamente el paquete TS.
- No se hizo push al repositorio ni despliegue a Cloudflare. No se modificaron bases de produccion.
