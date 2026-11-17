# IA Workforce – Catena Zapata

Repositorio fuente de la primera implementación técnica de una plataforma de agentes empresariales.

**Estado: entrega parcial verificable, no homologada para producción.**

Abrir primero [`docs/README.md`](docs/README.md), seguido de [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) y [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

- Agente de órdenes de compra: ingreso manual, documentos, extracción propuesta con Workers AI, revisión, controles de Loyal, exportación CSV condicionada y auditoría.
- Frontend React/TypeScript, API Hono/Workers, migraciones Supabase/PostgreSQL y microservicio Python de lectura documental.
- No se tocaron el SSO central ni las aplicaciones existentes ni se desplegó en Cloudflare.
- No hay integraciones productivas verificadas: SSO, Loyal, ERP y Microsoft Graph requieren acceso, contratos y pruebas.
- El archivo ZIP incluye **código, configuraciones y pruebas ejecutables**, pero no sustituye los accesos ni las verificaciones pendientes.
