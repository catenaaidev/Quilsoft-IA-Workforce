# Resultados de verificación — 17 de noviembre de 2026

**Los resultados siguientes son reales del entorno de creación, no de Cloudflare productivo.**

## Ejecutadas y aprobadas

| Control | Herramienta | Resultado |
|---|---|---|
| Compilación del módulo de reglas puro TypeScript | `tsc -p packages/domain/tsconfig.json` (TypeScript global) | APROBÓ |
| Pruebas del dominio (bloqueo Loyal, validación, CSV, transiciones, archivos) | `node --test packages/domain/test/*.test.mjs` | **9 / 9 PASARON** |
| Pruebas del procesador documental (TXT, PDF, DOCX, XLSX, imagen sin OCR, auth, firmas) | `python -m pytest services/document-processor/tests -q` | **7 / 7 PASARON** |
| Análisis sintáctico de archivos TS/TSX | Parser TypeScript `createSourceFile` | **0 errores sintácticos** |
| JSON y archivos esenciales | `python scripts/verify_package.py` | **Sin errores de estructura** |
| OpenAPI | `yaml.safe_load(docs/openapi.yaml)` | **Parseado correctamente: versión 3.0.3** |
| Contenido ZIP | `zipfile.testzip()` y `unzip -t` | **APROBÓ**: CRC, presencia de fuentes, rutas únicas y ausencia de dependencias regenerables |

## No ejecutadas; no confundir con pruebas aprobadas

| Prueba o validación | Estado y motivo |
|---|---|
| `npm install`, generación de lockfile npm, build React/Vite y Hono | **NO EJECUTADAS**: registro npm inaccesible por DNS `EAI_AGAIN`; error reproducible en npm view |
| Vitest API Hono y Playwright navegación | **NO EJECUTADAS**: paquetes JS no instalados |
| Migraciones SQL sobre Supabase | **NO EJECUTADAS**: no se usó una base de pruebas conectada |
| Workers AI y extracción real | **NO EJECUTADAS**: falta cuenta/binding y documentos de validación autorizados |
| Cloudflare Workers/Queues/Workflows/R2/Durable Objects | **NO EJECUTADAS**: recursos sin configurar; no hubo despliegue |
| Lectura de Microsoft Graph | **NO EJECUTADA**: falta token/consentimiento/buzón y pruebas de alcance |
| Integración productiva de Loyal | **NO IMPLEMENTADA**: falta contrato real. Resultado `unknown` bloquea |
| Exportación de CSV compatible con ERP real | **NO VALIDADA**: falta ejemplo oficial, aunque el algoritmo CSV de dominio está probado |
| Integración SSO BESA | **NO VERIFICADA**: falta revisar el SSO real y su contrato |
| Auditoría ofensiva y Ley 25.326 | **NO CERTIFICADAS**: requieren revisión técnica, organizacional y legal |

## Alcance de los tests de dominio

Pruebas de aprobación con todos los estados de Loyal, datos obligatorios, cuantías negativas/cero, transiciones de flujo, CSV BOM/CRLF/citas, no exportar sin mapping, rechazo de JSON no válido, validación de firmas de documento y prevención básica de fórmulas CSV.

## Limitación del entorno

La versión local de Node del contenedor fue 22.16.0; el monorepo recomienda 22.19+ por la versión contemporánea de Cloudflare Agents SDK. Las pruebas aisladas del dominio funcionaron en la versión disponible. No hay evidencias de ejecución o instalación completa del frontend/backend.
