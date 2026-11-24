# EXPO AI Agent — estado real, pruebas y pendientes (24/11/2026)

Rama local `expo-agente-oc` (base `f006051`). **Desplegado el 24/11/2026** como versión `24c3436b-58ca-431c-b9d1-d6867b28d7d8`
(anterior: `6975e925-c2d9-4bfc-8048-28d0ccbc2165`). Migración 0007 aplicada en producción. **Sin commit.**
Respaldo previo: `entregables/respaldos/respaldo-d1-20261124-0844.sql` y bookmark Time Travel
`00000030-00000000-0000512d-7478cc6f60f928e80fbe50b08f16f32f`.

Leyenda: **Implementado** = código escrito · **Probado** = cubierto por pruebas automáticas que pasaron ·
**Visto** = verificado en navegador contra el Worker local · **Simulado** = solo dobles/simulador ·
**Pendiente externo** = depende de IT, Loyal o una prueba en Worknet.

## 1. Matriz de estado

| Función | Estado | Evidencia |
|---|---|---|
| SSO BESA (besa-identidad-central) | Ya en producción, sin cambios | `auth.ts` intacto |
| Lectura automática de `exportorders@catenazapata.com` cada minuto | Implementado + Probado con Graph simulado · **Pendiente externo** (credenciales de IT) | `expo.spec.ts` › buzón |
| Solo lectura en Graph (solo GET; no envía, no mueve, no borra, no marca leído) | Probado | la prueba verifica que todo pedido a Graph es GET |
| OC creada solo si hay adjunto válido; tipo detectado por contenido (no por extensión ni `octet-stream`) | Probado | `sniffMime`, adjuntos inline ignorados |
| Sin duplicados (cursor delta + `graph_message_id`) | Probado | segunda consulta no crea nada |
| `.eml` original archivado en R2 con SHA-256 | Probado | |
| Registro de cada consulta al buzón (`mail_poll_runs`) | Probado | sin credenciales el cron no consulta (comportamiento previo) |
| Extracción por niveles 0–3 | Probado | ver §2 |
| Tokens reales; estimados marcados como tales | Probado | |
| Presupuestos por documento / día / mes; si se supera, no se llama a la IA y la OC queda para revisión humana | Probado | |
| Costo: solo con precios cargados en `ai_model_prices`; si no, `null` (no se inventa) | Probado | |
| Borrador CSV Worknet de 22 columnas, sin IA, desde la OC + historial oficial | Probado + Visto | formato tomado del CSV real WINEBOW |
| Origen de cada dato del borrador (OC / historial / regla / persona / pendiente) | Probado + Visto | |
| Cliente Worknet resuelto solo si hay un único candidato (código, lista confirmada o maestro) | Probado + Visto | |
| Aprobación bloqueada si el borrador Worknet está incompleto (`WORKNET_DRAFT_INCOMPLETE`) | Probado | |
| CSV definitivo bloqueado hasta registrar una importación real en Worknet (`WORKNET_FORMAT_NOT_VALIDATED`) | Probado | |
| CSV definitivo: `;`, coma decimal, DD/MM/AAAA, CRLF, sin BOM, SHA-256 auditado | Probado | **Compatibilidad con Worknet NO afirmada** hasta la prueba de importación |
| Nunca se carga en Worknet automáticamente | Por diseño | no existe ninguna llamada al ERP |
| Panel "Qué hacer ahora" y estado real de integraciones | Implementado + Visto | |
| Métricas reales del agente de OC y edición de presupuestos en panel lateral (auditado) | Probado + Visto | |
| Estado del formato Worknet y registro de la prueba de importación (administrador, auditado) | Probado + Visto | |
| Consulta manual del buzón (administrador) | Implementado | responde 409 si Graph no está configurado |
| Loyal: adaptador real de solo lectura | Implementado (ya existía) · **Pendiente externo** (API oficial) | fail-closed |
| Loyal: simulador aislado (aprobado, pendiente, rechazado, no encontrado, error de conexión, desconocido) | Simulado; deshabilitado en producción | `SKU-ERROR-5` agregado |
| Respuesta simulada de Loyal nunca habilita una aprobación | Ya existía, se mantiene | aprobación exige `source==='loyal-api'` |
| Ninguna OC queda aprobada solo por IA | Por diseño | aprobación humana obligatoria |

### Correcciones de errores encontrados durante las pruebas

1. **Error preexistente en producción**: `Store` rechazaba cualquier nombre de columna con dígitos
   (`sha256`, `r2_key`). Toda subida de documento (manual o por correo) y toda generación de CSV
   terminaban en `D1_INVALID_FIELD`. Se corrigió la validación a `^[a-z_][a-z0-9_]*$` (sigue
   impidiendo inyección).
2. **Error preexistente de diseño**: en el detalle de la orden, la tabla del CSV ensanchaba la página
   (3.227 px en una ventana de 1.009 px). Se corrigió con `min-w-0`.
3. **Error introducido y corregido antes de entregar**: la página Integraciones quedaba en blanco al
   agregar la última consulta del buzón a `/api/integrations`. Detectado en el navegador, corregido.

## 2. Niveles de extracción (optimización de tokens)

| Nivel | Qué hace | Tokens |
|---|---|---|
| 0 · caché | Mismo archivo (SHA-256) ya extraído, o reintento de un documento con extracción guardada | 0 |
| 1 · determinístico | La OC ya viene como CSV Worknet: se lee sin IA | 0 |
| 2 · económico | `@cf/meta/llama-3.1-8b-instruct-fast` (configurable con `AI_MODEL_ECONOMICO`), JSON estricto, prompt compacto versionado | reales |
| 3 · avanzado | `AI_MODEL` (llama-3.3-70b) solo si el nivel 2 no pasa la validación; se registra el motivo | reales |

A la IA se envía solo el texto del adjunto, nunca el cuerpo del correo.

## 3. Pruebas ejecutadas (24/11/2026, Windows, Node 24)

| Suite | Comando | Resultado |
|---|---|---|
| Dominio (incluye 6 nuevas de Worknet) | `npm run test:domain` | **15/15** |
| API (3 existentes + 15 nuevas EXPO, D1 SQLite real con migraciones 0001–0007) | `npm run test:api` | **18/18** |
| Integración OC aislada | `npm run test:oc` | **3/3** |
| Build completo (dominio, web, tipos API, verificación de despliegue) | `npm run build` | **OK** |
| Empaquetado del Worker sin publicar | `npx wrangler deploy --dry-run` | **OK**, todos los bindings |
| Migraciones 0001–0007 en D1 local (miniflare) | `wrangler d1 migrations apply --local` | **OK** |
| Navegador contra el Worker local (modo desarrollo, D1 local con datos anonimizados) | panel, detalle de OC, agentes, edición de presupuesto, integraciones | **OK** tras corregir los errores 2 y 3 |

**No ejecutado**: pruebas Playwright (`npm run test:web`), pruebas contra Microsoft Graph real, Loyal real,
importación en Worknet, migración remota y deploy. El disparo del cron en modo local queda interceptado por
el ruteo de la SPA; la lectura del buzón está cubierta por las pruebas unitarias.

## 4. Pendientes que dependen de terceros

| Pendiente | Responsable | Qué hace falta |
|---|---|---|
| Credenciales Microsoft Graph | IT | App registration con `Mail.Read` de aplicación **limitada al buzón** con Application Access Policy; secretos `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_MAILBOX` |
| API oficial de Loyal (solo lectura) | IT / proveedor | URL, token de solo lectura, valor de "aprobado": `LOYAL_LOOKUP_URL_TEMPLATE`, `LOYAL_READ_TOKEN`, `LOYAL_APPROVED_VALUE` |
| Prueba de importación en Worknet | Sebastián | Importar un CSV generado y registrar la evidencia en Integraciones |
| Precios de modelos | Administración | Cargar `ai_model_prices` para informar costo (si no, se muestra "sin precios") |
| Historial oficial completo | Comercial | Importar en "Fuentes comerciales" los CSV Worknet históricos de cada cliente |

## 5. Pendiente de desarrollo (no incluido en esta entrega)

- Normalización de catálogo con alias y candidatos (hoy: código o descripción exacta).
- Lectura determinística (nivel 1) de tablas en XLSX / Word.
- Caché de Loyal con vigencia; presupuestos por agente / área / usuario.
- Endpoint de reintento de ejecuciones fallidas desde la interfaz.
- Evaluar Supabase: `integrations/oc-m365-supabase` duplica el flujo y no está desplegado; se recomienda no usarlo.
