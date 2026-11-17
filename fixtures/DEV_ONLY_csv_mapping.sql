-- ONLY FOR AN ISOLATED DEV DATABASE. This is not the real ERP specification.
insert into public.erp_csv_mappings (name,version,config,validated,validated_by,validated_at,active)
values ('FICTICIO_SOLO_PRUEBAS',1,
 '{"validated":true,"delimiter":";","header":true,"columns":[{"column":"ORDEN","source":"orderNumber"},{"column":"CLIENTE","source":"client"},{"column":"CODIGO","source":"sku"},{"column":"DESCRIPCION","source":"description"},{"column":"CANTIDAD","source":"quantity"},{"column":"UNIDAD","source":"unit"},{"column":"PRECIO","source":"unitPrice"},{"column":"MONEDA","source":"currency"}]}'::jsonb,
 true,'FICTICIO_SOLO_PRUEBAS',now(),true);
-- NEVER apply on any staging / production database.
