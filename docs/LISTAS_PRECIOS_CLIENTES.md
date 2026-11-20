# IA Workforce - lista de precios y OC recibida

**Flujo objetivo:** correo Microsoft 365 (solo lectura) -> PDF/Excel de OC original -> extracción con IA -> consulta de maestros -> sugerencia de lista por cliente -> confirmación humana -> validación Loyal -> CSV Worknet de 22 columnas -> revisión y descarga manual.

Fuente analizada: `Dashboard Reporte de Ventas ME(2).xlsx`, hoja `Ranking de Customers por Me (2)`. Se recuperaron **115 clientes únicos** de **121 filas** con código; las 6 adicionales son repeticiones idénticas de INTERVINE, sin discrepancia de lista. La tabla contiene **códigos de lista** pero NO precios unitarios por producto. Nunca completar un precio ausente desde este archivo.

El parche agrega `/listas-precios` y un selector en el detalle de la orden; permite crear o actualizar correspondencias y guarda auditoría. La API exige permiso `admin.agent` para editar el maestro y `orders.write` para confirmar la lista por orden. En el CSV, la columna H `Cod. Lista de Precio` debe configurarse con el origen `priceListCode` en el mapeo oficial de 22 columnas. La generación rechaza la orden si no fue confirmada una lista, incluso si Loyal y la revisión humana se completaron.

Se incluyen dos scripts SQL: `0003_customer_price_lists.sql` (tablas) y `0004_customer_price_lists_seed.sql` (datos históricos). Ejecutarlos **una sola vez** contra D1. El SQL fuente usa `INSERT OR IGNORE`, no modifica filas existentes.

El ZIP es incremental, no contiene secretos y no incluye otras bases. Después de descomprimir ejecutar `python scripts/apply_price_list_patch.py` desde la carpeta raíz. Si un marcador no coincide, el instalador se detiene para evitar cambios silenciosos. Verificar `npm ci && npm run build` y `npx wrangler deploy --dry-run` antes de publicar.

**Dependencias que permanecen pendientes:** credenciales Graph para buzón corporativo y prueba real de lectura, API de solo consulta de Loyal, mapeo completo validado del CSV Worknet y pruebas integrales de una OC real. El parche NO activa por sí solo el buzón ni autoriza fichas.
