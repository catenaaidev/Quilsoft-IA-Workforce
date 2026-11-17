# Seguridad y protección de información — estado previo a producción

**Este material no constituye certificación de cumplimiento con Ley 25.326 ni auditoría externa de seguridad.** Los contratos, bases legales, avisos, responsables, retención, transferencias internacionales y evaluación de proveedores deben aprobarse por Legal y Seguridad de la Información.

## Controles de código presentes

- SSO: validación JWT (`iss`, `aud`, JWKS, algoritmo permitido) + `app_memberships.active=true`; identidad estable basada en `sub`. Denegación explícita si faltan SSO o membresía.
- Permisos backend: comprobación de rol para cada ruta, incluida consulta de archivos, exportación, modificaciones y auditoría.
- Secretos: solo Worker/Python, nunca frontend. `.gitignore` protege `.env` y `.dev.vars`.
- Supabase: tablas con RLS y sin grants a `anon` o `authenticated`; backend privilegiado, prohibido exponer service key en browser.
- Archivos: privados en R2, tamaño máximo 12 MB, tipos admitidos explícitos, firma de cabecera, SHA-256 y duplicados; respuesta con `nosniff`, `no-store`.
- IA: recibe documentos como datos no confiables; no recibe herramientas de escritura ni privilegios de negocio. Validación Zod de JSON estructurado. Revisión humana obligatoria.
- Loyal: status desconocido o error **bloquea**. La aprobación requiere confirmación actual de todas las fichas.
- ERP: ausencia completa de endpoints de escritura. CSV solo con mapeo validado.
- Auditoría: `audit_events` append-only por trigger SQL y eventos de negocio en backend.
- Cliente: no hay password local; no guarda el token en `localStorage`.

## Pendientes de seguridad antes de producción (bloqueantes)

1. Inspeccionar y probar el **SSO real**, cookies, CSRF, cierre de sesión, revocación, MFA de administradores y sesiones entre aplicaciones.
2. Revisar autorización por **bodega/proceso/orden** y no solo rol global. Probar IDOR/BOLA mediante cuentas distintas y estructuras reales.
3. Threat modeling de Microsoft Graph: restringir `Mail.Read` de aplicación al buzón preciso, configurar Application RBAC, limitar permisos y revisar consentimientos.
4. Validación criptográfica/escáner antivirus/antimalware de archivos en ingreso; descompresión acotada; límites de páginas y tokens, aislamiento del Container.
5. Asegurar contenedores por red privada, autorización mutua y no exposición de endpoint de procesador en internet.
6. Revisar AI Gateway: desactivar almacenamiento innecesario de prompts/respuestas confidenciales; habilitar cuotas, rate limiting, alertas y costos reales.
7. Protección contra prompt injection con pruebas adversariales reales; documentar modelos y contratos de privacidad.
8. Cifrado: confirmar TLS, cifrado de R2 y PostgreSQL, política de claves y backup/restore ensayado.
9. Retención y eliminación autorizadas de documentos, correos y logs; exportación y rectificación de información personal, registros de tratamiento.
10. Fortalecer auditoría resistente a administradores: replica inmutable/almacenamiento WORM, integridad encadenada y monitoreo SIEM.
11. Evaluar seguridad de dependencias con lockfiles completos, análisis de vulnerabilidades, SAST, DAST, test de penetración, regresión y revisión del proyecto de Cloudflare.
12. Asegurar cabeceras de seguridad, CSP frontend, CORS y CSRF según el protocolo final SSO.
13. Probar reintentos de Workflows, idempotencia, recuperaciones y reconciliación R2/DB tras fallos y consumos.
14. Segregar desarrollo/staging/producción en cuentas, tokens, buckets, colas y BD distintas, con gates de aprobación.
15. Confirmar quién puede asignar roles, editar instrucciones de agentes y aprobar órdenes, y qué evidencia se exige al control humano.

## Ley 25.326

Evaluar quién es responsable de tratamiento, qué datos personales aparecen en órdenes/correos, finalidad, minimización, plazos de conservación, proveedores internacionales, base jurídica, controles de acceso y ejercicio de derechos. El análisis técnico no sustituye evaluación legal y organizacional.

## Reglas que nunca deben relajarse

- No habilitar mocks, fixtures, `local-demo-admin`, ni CSV ficticio en Cloudflare de staging o producción.
- No otorgar permisos a agentes a través de instrucciones libres.
- No usar capturas/documentos como evidencia de ficha aprobada sin acuerdo de proceso con Calidad y Compras.
- No incorporar credenciales reales al ZIP, frontend, Git o logs.
- No modificar login central ni otras aplicaciones al implementar IA Workforce.
