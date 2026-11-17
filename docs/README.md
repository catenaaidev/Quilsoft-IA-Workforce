# IA Workforce – Catena Zapata

**Entrega técnica 0.1.0 — implementación parcial verificable. NO es una solución lista para producción.**

Este repositorio es el resultado de una primera implementación de la solicitud original (`SOLICITUD_ORIGINAL.md`). Contiene código real del frontend React, backend Hono/Cloudflare Workers, migraciones PostgreSQL/Supabase, motor de reglas, pipeline documental (Workers AI / FastAPI), colas y Workflows, adaptadores y pruebas. La primera automatización se concentra en **órdenes de compra**. No modifica el login multifactor actual ni otros sistemas.

## Qué hace realmente el código

- Interfaz React + TypeScript + Vite + Tailwind, React Router, TanStack Query/Table, React Hook Form y Zod; navegación, carga manual de OC, consulta, filtros, corrección de líneas/cabecera, anexos, estados, revisión y seguimiento.
- API modular Hono con validación estricta, autorización por rol, control de versiones, respuesta de errores y eventos de auditoría.
- Migración SQL para órdenes, productos, documentos, extracción, catálogo de agentes, versionado de instrucciones, permisos, fuentes, herramientas, CSV, ejecuciones, integraciones y auditoría; RLS habilitada, Data API cerrado a `anon`/`authenticated`.
- Archivos privados en R2 con huella SHA-256, control de tamaño/tipo/firma y deduplicación por orden.
- Workers AI Markdown Conversion, extracción estructurada con un modelo Workers AI y Zod. La IA **siempre** deja los resultados para revisión humana.
- Cloudflare Queues + Workflow para ejecución independiente del navegador; reintentos de extracción y control básico de idempotencia.
- Microsoft Graph: adaptador de lectura por delta del Inbox de un único buzón configurado; no envía mensajes y no requiere modificar destinatarios de clientes.
- Loyal: contrato explícito en estado `unknown` hasta recibir la especificación real. Solo la identidad local de pruebas puede utilizar fichas sintéticas.
- CSV: generador determinístico con validación, escape de comillas y delimitadores, BOM UTF-8, CRLF y bloqueo de valores con apariencia de fórmula; el mapeo real del ERP **debe ser validado y habilitado** antes de permitir exportación.
- Servicio FastAPI aislable en Cloudflare Containers para texto PDF, XLSX, DOCX, imágenes (OCR optativo) y texto plano.
- Seguridad: SSO por JWT firmado mediante JWKS de la autoridad confiable; membresía en BD. Sin SSO configurado, **no hay acceso a producción**.

## Dependencias externas que impiden afirmar «completo»

1. **SSO central de Bodegas Esmeralda**: faltan issuer real, JWKS, contrato de sesión/cookie y sujeto estable, definición de asignaciones y pruebas con usuarios existentes.
2. **Loyal**: faltan API real, credenciales de solo lectura, respuestas de ficha técnica y lógica de homologación. La producción bloquea toda aprobación cuando no obtiene el estado `approved` de origen real.
3. **ERP y CSV**: faltan exportación oficial de ejemplo, maestros y criterios de columnas/codificación; no existe escritura al ERP.
4. **Microsoft Graph**: faltan autorización/consentimiento en Entra ID, buzón, alcance aplicativo efectivo restringido y pruebas con mensajes de muestra.
5. **Cloudflare y Supabase**: faltan cuentas/bindings/secrets reales; no se aplicaron migraciones a proyectos del usuario, ni se corrió despliegue.
6. **Paquetes JS**: el entorno de creación no permitió acceder a `registry.npmjs.org` (`EAI_AGAIN`). Por ello no se instaló el monorepo ni se pudo ejecutar su compilación y QA E2E. Se entregan manifiestos versionados, pero **falta generar y confirmar el lockfile real con `npm install`** en una máquina con internet.

## Estructura

```text
apps/api/                   Hono API, Graph, Loyal, IA, Store, Worker, Cron, Queues y Workflows
apps/web/                   React, UX, edición, dashboard, órdenes, agentes, documentos y auditoría
packages/domain/            Reglas comerciales puras, validador y CSV con tests ejecutables
infra/supabase/migrations/  Migración SQL versionada, RLS y restricciones
services/document-processor/  FastAPI Python, Dockerfile y pruebas
fixtures/                   Ejemplos de datos 100% ficticios y mapeo CSV SOLO DEV
docs/                       Arquitectura, seguridad, implementación, manuales, pruebas
scripts/                    Verificación estática
.github/workflows/          CI sugerida, requiere acceso a npm
```

## Instalación desde cero (sin tocar producción)

Requiere **Node.js 22.19+**, npm, Python 3.12+ y una cuenta de Cloudflare con los servicios habilitados.

1. Descomprimir el ZIP en un proyecto limpio; revisar `docs/SECURITY.md` y `docs/DEPLOYMENT.md`.
2. En la raíz ejecutar `npm install --no-audit --no-fund` (con internet). Generará `package-lock.json`: **conservarlo y versionarlo**.
3. Ejecutar `npm run build`, `npm run test:domain` y `npm run test:api`.
4. Crear Supabase **de prueba**, revisar y aplicar `infra/supabase/migrations/20261117160000_workforce_init.sql` mediante el proceso aprobado de migraciones. Comprobar RLS, restricciones, funciones y audit.
5. Crear bucket R2 privado, Queue y dead-letter Queue, Workflow y DO según `docs/DEPLOYMENT.md`.
6. Configurar secretos en Worker, SSO corporativo, membresías y herramientas de IA solo después de la revisión técnica.
7. Ejecutar primero en un entorno aislado de pruebas. No habilitar producción hasta completar los gates del checklist.

> El worker configura `APP_ENV=production` y `workers_dev=false` para fallar cerrado. Solo si se usa **Wrangler local + base separada de prueba** puede establecerse `APP_ENV=development`. El header de demostración requiere que la petición sea a `localhost` o `127.0.0.1`.

## Pruebas disponibles inmediatamente

```bash
cd packages/domain
# Si hay tsc global o después de npm install:
npx tsc -p tsconfig.json
node --test test/*.test.mjs

cd ../../services/document-processor
python -m pytest tests -q

cd ../..
python scripts/verify_package.py
```

La salida de las verificaciones efectivamente ejecutadas está en `docs/TEST_RESULTS.md`. La evidencia **no equivale a pruebas de Workers, Supabase, SSO ni ERP en producción**.

## Referencias técnicas verificadas a noviembre de 2026

- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Workers AI Markdown Conversion: https://developers.cloudflare.com/workers-ai/features/markdown-conversion/usage/binding/
- Cloudflare Agents SDK: https://developers.cloudflare.com/agents/agent-class/
- Cloudflare Workflows: https://developers.cloudflare.com/workflows/get-started/guide/
- Microsoft Graph messages/delta: https://learn.microsoft.com/en-us/graph/api/message-delta
- Supabase security: https://supabase.com/docs/guides/api/securing-your-api

**No se utilizó el sitio de Quilsoft ni el artefacto de Claude como fuente de código.** Son referencias de requerimientos; no se obtuvo su código ni se comprobó acceso.
