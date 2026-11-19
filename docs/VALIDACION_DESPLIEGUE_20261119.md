# Validación de la entrega — 19/11/2026

## Diagnóstico confirmado

Repositorio: catenaaidev/Quilsoft-IA-Workforce, main, commit 67d67043dd7e7c4a2fbb53b4eec4fa5cb99e5a98.
Build fallido: 1f9af46a-c773-4d97-bddd-8455c7840171.
El build compiló y pasó 3 pruebas; falló al publicar porque el módulo OC no exportaba PurchaseAgent. Cloudflare había sobreescrito el nombre oc-worknet-m365-supabase con quilsoft-ia-workforce.

## Cambios

- Restauración de los workspaces apps/api, apps/web y packages/domain en package.json raíz.
- Configuración raíz coherente con plataforma, assets, Durable Object, Workflow, cola, D1, R2 y SSO.
- Recuperación del código D1/SSO del ZIP completo disponible; se conserva el módulo OC actual en integrations/oc-m365-supabase.
- Lockfile npm incluido y Wrangler 4.165.0 fijado para el despliegue raíz.
- Verificación previa que detecta pérdida de clases o bindings y ausencia del frontend compilado.
- Actualización de una prueba SSO obsoleta: se envía una cookie de sesión sintácticamente válida para comprobar el 503 cuando falta el servicio de identidad; el caso anónimo continúa exigiendo 401.
- El verificador de archivos omite dependencias, cachés y artefactos compilados.
- CI incluye pruebas de dominio, API, módulo OC, empaquetado, navegador y documentos; incluye reportlab requerido por sus pruebas PDF.

## Resultados locales

| Control | Resultado |
| --- | --- |
| Compilación dominio, frontend y API | Correcta |
| Dominio | 9 pruebas correctas |
| API y acceso anónimo/SSO | 3 pruebas correctas |
| CSV/Graph/bloqueo de exportación OC | 3 pruebas correctas |
| Extracción de documentos Python | 7 pruebas correctas |
| Wrangler deploy --dry-run | Correcto, clases y bindings presentes |
| Verificador de archivos fuente | Sin errores antes de generar documentación final |
| Navegación Playwright | No completada: Chromium no puede crear sockets en este entorno; prueba incluida en CI |
| Health de la versión ya publicada | HTTP 200; productionReady:false |

22 pruebas de backend/dominio/documentos pasaron. No se verificó una sesión real SSO ni el circuito completo de datos en producción. La lectura del health corresponde a la versión que ya estaba publicada, no a esta entrega.

## Estado de publicación

No se realizó push ni despliegue de este paquete. Se entrega para la carga solicitada a Git. No se modificaron recursos ni secretos de producción. La configuración de Builds observada ya usa raíz /, npm run build y npx wrangler deploy.

La revisión automática rechazó recuperar las variables de despliegue porque podrían incluir credenciales. No se extrajeron sus valores ni se incorporaron parches guardados exclusivamente allí. El paquete consolida las fuentes accesibles; no permite asegurar equivalencia exacta con todos los cambios que pudieran existir únicamente en la versión publicada.

Microsoft 365 requiere sus secretos y autorización de buzón; Loyal, extracción semántica e integración final del módulo OC al SSO siguen pendientes según el README del módulo. Esta entrega corrige estructura y empaquetado, no certifica esas integraciones.
