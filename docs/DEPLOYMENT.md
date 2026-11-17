# Instalación y despliegue — guía de preparación, NO orden de desplegar

La plataforma no fue desplegada ni configurada en cuentas de producción. Usar tres ambientes aislados. Los comandos son para revisión y pruebas de administradores autorizados.

## Requisitos previos

- Node 22.19+, npm, Wrangler actualizado, cuenta Cloudflare habilitada y proyecto Supabase de **test**.
- Contrato real de SSO BESA (issuer, JWKS, audience, cookie o Bearer, session expiry, revocación).
- Identificar un responsable Cloudflare/Supabase y disponer de autorización escrita del equipo.

## 1. Preparar monorepo

```bash
npm install --no-audit --no-fund
npm run build
npm run test:domain
npm run test:api
python scripts/verify_package.py
```

Tras instalar con conectividad, generar `package-lock.json` y versionarlo. Ejecuciones repetibles posteriores con `npm ci`. El proyecto original no incluye lockfile porque no había conectividad npm durante la creación.

## 2. Supabase (solo test)

Revisar `infra/supabase/migrations/20261117160000_workforce_init.sql` y ejecutarlo únicamente sobre un proyecto de prueba. Verificar tablas, claves, RLS, función de corrección, triggers de auditoría y permisos. **No usar la base del SSO existente.** La app solo mantiene el `sub` externo y sus roles internos, no contraseñas.

Crear membresías autorizadas tras confirmar el `sub` real:

```sql
-- EJEMPLO con identificador ficticio, solo test
insert into public.app_memberships(subject, display_name, role, active)
values ('SSO_SUBJECT_DE_PRUEBA', 'Operador prueba', 'operator', true)
on conflict(subject) do update set active=excluded.active;
```

Para demo aislada se puede cargar `fixtures/DEV_ONLY_csv_mapping.sql` en una base separada de pruebas. **No utilizarlo en ningún ambiente comercial**.

## 3. Recursos Cloudflare

Crear con nombres revisados: bucket privado `ia-workforce-docs-private`; Queue `ia-workforce-documents`; DLQ `ia-workforce-documents-dlq`. El `wrangler.jsonc` del Worker define AI binding, Queue producer/consumer, Workflow, Durable Object Agent, Cron cada 10 minutos y Static Assets desde el `dist` de Vite. Los recursos se crean fuera del repositorio y requieren permisos específicos de la cuenta.

Establecer bindings y nombres de recursos según el ambiente. Antes de desplegar, comprobar las configuraciones de Wrangler con su CLI de la versión instalada. No usar un `workers.dev` público para producción; el archivo fija `workers_dev:false`.

## 4. Secretos del Worker

Configurar en cada ambiente usando el sistema de secretos de Cloudflare, no en `vars` ni en el Git:

```bash
cd apps/api
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SSO_ISSUER
npx wrangler secret put SSO_AUDIENCE
npx wrangler secret put SSO_JWKS_URL
# Solo cuando estén autorizados:
npx wrangler secret put GRAPH_TENANT_ID
npx wrangler secret put GRAPH_CLIENT_ID
npx wrangler secret put GRAPH_CLIENT_SECRET
npx wrangler secret put GRAPH_MAILBOX
```

Para un entorno de desarrollo local, copiar `apps/api/.dev.vars.example` a `.dev.vars` e ingresar **solo credenciales de prueba**. El modo local de identidad de desarrollo necesita `APP_ENV=development` y `x-local-demo:true`, pero el servidor además requiere que la petición sea a `localhost` o `127.0.0.1`. Nunca activar en hosting remoto.

## 5. Ejecutar localmente

Después de `npm run build`, en terminal A:

```bash
cd apps/api
npx wrangler dev --local
```

En terminal B:

```bash
cd apps/web
npm run dev
```

El proxy de Vite envía `/api` a `http://127.0.0.1:8787`. Usar la base y R2 de pruebas. Ejecutar las pruebas con fixtures; la verificación productiva de Loyal y CSV permanece cerrada.

## 6. Procesamiento Python

```bash
cd services/document-processor
python -m pip install -r requirements.txt pytest httpx
python -m pytest tests -q
# Solo local; proteger token y no exponer en internet
DOC_PROCESSOR_TOKEN=TOKEN_DE_PRUEBA uvicorn app.main:app --port 8000
```

El `Dockerfile` está preparado como base para Cloudflare Containers. Su conexión privada a Workers, red, autenticación y aprovisionamiento de Container **quedan pendientes de verificar con la cuenta real**. No agregar su URL pública hasta definir la segmentación.

## 7. Microsoft 365

Registrar la aplicación en Entra ID. Solicitar **solo lectura** de correo y adjuntos para el buzón autorizado; en permisos de aplicación usar `Mail.Read` **restringido al buzón corporativo** mediante controles de Exchange/Entra. No otorgar lectura global sin restricción efectiva ni permitir envío/escritura. Configurar token cliente/tenant, `GRAPH_MAILBOX` y revisar la búsqueda incremental `messages/delta`. Probar paginación, eliminación, adjuntos duplicados, errores 429 y reinicios.

## 8. Producción — gates obligatorios

No activar hasta que responsable de Seguridad/Legal apruebe, SSO funcione y aplique roles correctamente, Loyal esté homologado, exista CSV real validado, migraciones comprobadas, backup/restore probado, procesamiento seguro verificado, AI Gateway sin logs sensibles, pruebas E2E e integración aprobadas, métricas y respuesta a incidentes definidas, y autorización explícita de despliegue.

**En esta entrega no se ejecutó `wrangler deploy`, SQL contra producción ni cambio de dominio.**
