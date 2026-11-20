# EXPO AI Agent — Maestro de productos Worknet (20/11/2026)

## Qué modifica

- Agrega menú **Maestro de productos** con búsqueda paginada y ficha original de 36 campos.
- Agrega API protegida `/api/product-catalog` (permiso `orders.read`).
- Al interpretar una OC, el agente busca códigos o descripciones **exactas** en el catálogo y presenta coincidencias para revisión humana. No asigna códigos ambiguos y no aprueba fichas Loyal.
- Migración idempotente D1 `0005_product_catalog.sql`.
- No cambia el SSO, el Worker, R2, listas de precios, órdenes anteriores ni el CSV de 22 columnas.

## Instalación en Git Bash (Windows)

Descargar ambos ZIP en Descargas. Ejecutar desde la raíz de `IA_WORKFORCE_CATENA_ZAPATA_COMPLETO`.

```bash
unzip -o "$HOME/Downloads/PARCHE_EXPO_MAESTRO_PRODUCTOS_20261120.zip" -d .
node scripts/apply_product_catalog_patch.mjs
npm ci
npm run build
```

**Si falla `npm run build`, detenerse: no publicar ni importar.**

Si compila correctamente, la tabla **ya fue creada desde Cloudflare** y verificada en esta sesión; también está disponible la migración para recrearla en otros entornos. Para cargar los registros por primera vez:

```bash
unzip -o "$HOME/Downloads/DATOS_PRIVADOS_EXPO_CATALOGO_20261120.zip" -d "$HOME/Downloads"
npx wrangler d1 execute ia-workforce-catena-db --remote --file="$HOME/Downloads/CATALOGO_2026_11_20_IMPORTAR_D1.sql"
npx wrangler d1 execute ia-workforce-catena-db --remote --command="SELECT COUNT(*) AS total FROM worknet_product_catalog"
```

El total debe ser **55601**. La importación usa `ON CONFLICT` para actualizar el catálogo por código sin crear duplicados. El proceso puede bloquear D1 brevemente: realizarlo en una ventana controlada.

Verificado el total, desplegar:

```bash
npx wrangler deploy
```

Comprobar visualmente **Maestro de productos** y las búsquedas por código `1600-01-480` y mercado `WINEBOW`. No generar exportaciones hasta completar las validaciones de Loyal.

## Mantener el repositorio seguro

No copiar `CATALOGO_2026_11_20_IMPORTAR_D1.sql` a la carpeta del proyecto ni ejecutarlo con `git add .`. Es un archivo de datos comerciales privados, para la base D1 solamente. El ZIP del parche contiene solo código y migración vacía. Evitar guardar tokens, credenciales y exportaciones de Worknet en GitHub.

## Estado de validación

- Migración creada en la D1 de producción y tabla verificada.
- Dataset validado con SQLite local: 55.601 filas, cero códigos repetidos.
- Integración nueva preparada en código; requiere compilación `npm run build` y despliegue desde el repositorio local (no verificados en producción).
- Las credenciales de Microsoft 365 y Loyal son dependencias externas separadas y no se resuelven con este catálogo.
