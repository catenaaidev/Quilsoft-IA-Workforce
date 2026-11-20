# EXPO AI Agent — edición segura del maestro de productos

Esta actualización permite altas manuales, modificaciones, desactivación reversible y reactivación. Solamente rol administrador. Nunca modifica Worknet ni aprueba fichas Loyal.

## Instalación (Git Bash, carpeta del proyecto)

1. Realizá una copia de seguridad del código y de D1.
2. Descomprimí este ZIP en la raíz del proyecto.
3. Ejecutá `npm run build`; no publicar si falla.
4. Ejecutá `npx wrangler d1 execute ia-workforce-catena-db --remote --file=infra/cloudflare/migrations/0006_catalog_editor.sql`.
5. Ejecutá `npx wrangler deploy`.
6. Probá inicio de sesión, consulta, alta, edición, desactivación y reactivación.

**Importante**: el catálogo exportado de Worknet permanece inmutable. Las ediciones manuales se almacenan en `worknet_product_catalog_overrides` y se aplican al consultar; sobrevivirán a una nueva importación del archivo base. Las altas manuales se registran con `source_file=Alta manual EXPO`. Las bajas nunca eliminan físicamente los datos. Se guarda auditoría.

Actualización masiva: la importación del Excel oficial sigue el procedimiento de SQL de Worknet ya disponible, con revisión de origen antes de incorporarlo; esta actualización no crea un importador Excel desde la interfaz.
