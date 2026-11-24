# Cambios — EXPO AI Agent (rama expo-agente-oc, 24/11/2026)

## Agregado
- Migración aditiva `0007_ai_metrics_worknet.sql`: tokens, nivel, motivo de escalamiento y caché por ejecución; `ai_budgets`; `ai_model_prices`; `mail_poll_runs`; formato `worknet-22-v1` (no validado, inactivo).
- `packages/domain/src/worknet.ts`: formato Worknet de 22 columnas, aprendizaje desde CSV históricos, armado y validación del borrador, `sniffMime`, firmas `.xls`/`.doc`.
- `apps/api/src/ai.ts`: extracción por niveles 0–3, presupuestos, tokens reales o estimados marcados, costo solo con precios.
- `apps/api/src/worknet-draft.ts`: borrador Worknet desde la OC y el historial oficial; resolución de cliente sin ambigüedad.
- `apps/api/src/expo-routes.ts`: `/api/expo/estado`, `/api/agents/purchase-orders/metricas`, `/api/expo/presupuestos`, `/api/expo/formato-worknet` (+ `/validar`), `/api/expo/buzon/consultar`.
- `apps/web/src/expo-panels.tsx`: "Qué hacer ahora", métricas del agente, presupuestos en panel lateral, formato Worknet.
- Pruebas: `packages/domain/test/worknet.test.mjs` (6), `apps/api/test/expo.spec.ts` (15) con D1 SQLite real.

## Cambiado
- Lectura de correo: solo GET, adjuntos por `$value`, tipo por contenido, OC solo con adjunto válido, `.eml` archivado, registro de cada consulta. Cron cada minuto.
- Procesamiento: caché por SHA-256, reutiliza la extracción propia al reintentar, borrador Worknet guardado en R2, presupuesto superado sin reintentos.
- Borrador CSV: Worknet de 22 columnas cuando no hay mapeo oficial activo (el mecanismo de mapeo existente se mantiene).
- Aprobación: bloqueada si el borrador Worknet está incompleto. CSV definitivo: exige formato validado con importación real.
- `/api/integrations`: estado real del correo (pendiente, configurado sin verificar, conectado, error).
- Simulador Loyal: escenario "error de conexión" (`SKU-ERROR-5`).

## Corregido
- `Store` rechazaba columnas con dígitos (`sha256`, `r2_key`): fallaban subidas de documentos y generación de CSV.
- Detalle de la orden: la tabla del CSV ensanchaba toda la página.
