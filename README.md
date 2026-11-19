# IA Workforce Catena — proyecto completo y despliegue corregido

## Subir a Git

Descomprimir y copiar **el contenido** a la raíz de `catenaaidev/Quilsoft-IA-Workforce`, rama `main`. `package.json`, `package-lock.json` y `wrangler.jsonc` deben quedar directamente en la raíz, no dentro de otra carpeta.

Cloudflare Builds para `quilsoft-ia-workforce`:

| Campo | Valor |
| --- | --- |
| Rama | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Estos comandos ya están configurados en el proyecto conectado. No usar los comandos antiguos que ejecutaban parches desde variables de entorno.

## Causa y corrección

El build del 19/11/2026 compilaba el módulo independiente `oc-worknet-m365-supabase`, pero Cloudflare intentaba publicarlo sobre `quilsoft-ia-workforce`. Cloudflare reemplazaba automáticamente el nombre de destino y rechazaba el archivo por no exportar `PurchaseAgent` (error 10064).

La raíz vuelve a compilar y desplegar la plataforma completa: frontend React, API, dominio, SSO BESA, D1, R2, cola, `PurchaseAgent` y `PurchaseWorkflow`. No se eliminan Durable Objects ni se aplican migraciones destructivas. El módulo de correo/Supabase se conserva completo en `integrations/oc-m365-supabase`.

## Verificación local

```sh
npm ci
npm run build
npm test
npm run deploy:check
```

`deploy:check` empaqueta el Worker y los recursos estáticos sin publicar ni modificar producción.

Prueba de navegación:

```sh
npx playwright install chromium
npm run test:web
```

## Microsoft 365 / Supabase

El módulo NO reemplaza a la plataforma y NO se activa automáticamente al publicar la raíz. Conserva sus archivos, SQL, pruebas e instrucciones en `integrations/oc-m365-supabase/README.md`.

Para publicarlo por separado, crear en Cloudflare un Worker `oc-worknet-m365-supabase` con raíz `integrations/oc-m365-supabase`. No conectar ese subdirectorio al Worker de la plataforma. Configurar secretos en Cloudflare, nunca en Git.

El módulo recibe y archiva correos/adjuntos e importa CSV históricos. La extracción semántica de PDF/Excel a líneas Worknet, la integración real con Loyal y su integración final al SSO siguen pendientes; este arreglo no las implementa. Las descargas permanecen bloqueadas hasta las validaciones requeridas.

## Alcance y procedencia

Consolidado del repositorio en el commit `67d67043dd7e7c4a2fbb53b4eec4fa5cb99e5a98`, con recuperación de las correcciones D1/SSO del paquete `IA_WORKFORCE_SSO_CLOUDFLARE_CORREGIDO.zip`. El repositorio aún conservaba la plataforma en `apps/`, pero su raíz había sido reemplazada por el módulo aislado. Se conserva el código actual de dicho módulo en su nuevo directorio.

Este paquete no es una exportación íntegra del estado vivo de Cloudflare. No se recuperaron parches guardados en variables de despliegue ni credenciales. No se publicó esta versión ni se modificó el Worker existente. La validación local no sustituye la comprobación de acceso SSO, datos e integraciones después del despliegue.

Consultar `docs/VALIDACION_DESPLIEGUE_20261119.md` para los resultados de esta entrega. Los demás documentos describen antecedentes y pueden contener estados históricos.
