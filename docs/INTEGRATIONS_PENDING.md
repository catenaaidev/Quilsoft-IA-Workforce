# Integraciones pendientes y evidencias necesarias

| Integración | Código aportado | Falta para habilitarla | Responsable a confirmar |
|---|---|---|---|
| SSO Bodegas Esmeralda | JWT/JWKS, `sub` estable, membresías/roles | Código o documentación real, cookies, login/logout, MFA, assignments, pruebas de revocación | Administrador SSO |
| Microsoft Graph | Token `client_credentials`, Inbox delta, solo lectura de adjuntos | Tenant, app, mailbox, permisos Mail.Read restringidos, consentimientos, pruebas | TI Microsoft 365 |
| Loyal | Contrato de respuesta `approved/pending/rejected/missing/unknown`, fail-closed | API oficial, autenticación, estados, casos de prueba reales | Dueño Loyal / Calidad |
| ERP | Consulta de maestros definida a nivel de contrato, sin escritura; CSV versionado | Especificación oficial, ejemplo válido, maestros, delimitador, codificación | ERP / Sebastián / Compras |
| Supabase | SQL + REST adapter | Proyecto, credenciales server-only, RLS, migraciones comprobadas, backups | Datos / TI |
| Cloudflare | Worker/Queues/Workflows/R2/Agents/AI config | Recursos de cuenta, plan disponible, IA, secretos, dominio, observabilidad | Plataforma / TI |
| Containers | FastAPI + Dockerfile | Binding interno y aislamiento de red, despliegue y SLA | Plataforma |
| AI Gateway | Propuesta de gobernanza | Cuenta/gateway, modelos autorizados, límites de costo, no retención de contenido sensible | Seguridad / Plataforma |

La integración debe tener pruebas con datos de prueba, revisión humana y resultado auditable. Ninguna integración de esta tabla se declara conectada en producción.
