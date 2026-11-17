# PROMPT MAESTRO — DESARROLLO COMPLETO DE IA WORKFORCE CATENA ZAPATA

## 1. Objetivo general

Actuá como un equipo senior de arquitectura de software, desarrollo frontend y backend, ingeniería de inteligencia artificial, automatización empresarial, ciberseguridad, bases de datos, QA y DevOps.

Necesito que desarrolles una **plataforma empresarial completa de agentes de inteligencia artificial**, denominada **IA Workforce – Catena Zapata**, destinada a automatizar procesos internos de distintas áreas de la empresa.

La plataforma será de propiedad de nuestra organización. Debemos conservar el control del código fuente, los datos, las integraciones, los agentes, la infraestructura y las configuraciones.

Tomá como referencias funcionales:

- Quilsoft IA Workforce: https://catena.workforce.quilsoft.com/
- Nuestra maqueta de automatización de órdenes de compra: https://claude.ai/artifact/QteRLhtREzY9yUCUAZxsLe
- La documentación y las definiciones técnicas realizadas previamente en este proyecto.
- Nuestro sistema centralizado de autenticación multifactor de Bodegas Esmeralda.

La aplicación debe ser funcional, modular, segura, escalable y preparada para producción.

**No quiero una maqueta visual, una demostración superficial ni un proyecto compuesto solamente por pantallas sin funcionamiento.**

Quiero el desarrollo real de la plataforma, sus módulos, servicios, procesamiento de información, bases de datos, controles, automatizaciones y pruebas.

Al finalizar, entregá el **proyecto completo en un único archivo ZIP descargable**, con todos los componentes necesarios para compilarlo, configurarlo y desplegarlo.

No confundas funcionalidades simuladas con integraciones verificadas. Cuando falten credenciales, documentación o accesos externos, implementá adaptadores utilizables y pruebas con datos ficticios, indicando qué falta para activar la integración real.

---

## 2. Stack tecnológico obligatorio

Utilizá como arquitectura principal:

**Frontend**
- React + TypeScript + Vite.
- Tailwind CSS.
- shadcn/ui.
- TanStack Query.
- TanStack Table.
- React Hook Form y Zod.
- React Router.

**Backend**
- Cloudflare Workers.
- TypeScript.
- Hono.
- API modular y documentada.
- Validación de entrada en backend.
- Separación entre presentación, servicios, integraciones y persistencia.

**Base de datos**
- PostgreSQL mediante Supabase.
- Migraciones SQL versionadas.
- Relaciones y restricciones de integridad.
- Drizzle ORM cuando resulte adecuado.
- Permisos aplicados en backend y en base de datos según corresponda.

**Inteligencia artificial**
- Cloudflare Workers AI como proveedor principal.
- Cloudflare Agents SDK para los agentes que requieran estado y herramientas.
- Cloudflare AI Gateway para observabilidad, límites y acceso a otros proveedores.
- Modelos multimodales de Workers AI disponibles y compatibles.
- Arquitectura capaz de incorporar OpenAI, Anthropic u otros proveedores sin modificar la lógica comercial.

**Procesamiento documental**
- Cloudflare Markdown Conversion para formatos compatibles.
- Modelos de visión de Workers AI.
- Python + FastAPI en Cloudflare Containers para procesamiento especializado.
- Librerías de lectura de PDF, Excel, Word e imágenes.
- OCR complementario únicamente cuando resulte necesario.

**Infraestructura**
- Cloudflare Workers y Workers Static Assets.
- Cloudflare Containers.
- Cloudflare Queues.
- Cloudflare Workflows.
- Cloudflare Cron Triggers.
- Cloudflare R2.
- Cloudflare Secrets.
- Cloudflare Observability.

**Integraciones**
- Microsoft Graph API para Microsoft 365/Outlook.
- Adaptador de consulta para Loyal.
- Adaptador de lectura de maestros del ERP.
- Integración con el login multifactor central existente.

**Desarrollo y pruebas**
- GitHub Actions.
- Vitest.
- Playwright.
- pytest.
- Pruebas de integración, seguridad y regresión.

Podés ajustar una librería concreta si descubrís incompatibilidades, pero documentá el cambio y preservá la arquitectura general.

No agregues servicios pagos externos sin explicar su necesidad.

---

## 3. Arquitectura y estructura de la aplicación

Desarrollá una plataforma central que permita crear, configurar, ejecutar, supervisar y administrar diferentes agentes empresariales.

La estructura debe contener:

1. Aplicación web administrativa.
2. API central.
3. Sistema de autenticación integrado.
4. Sistema de autorización por usuario, módulo y acción.
5. Registro de agentes.
6. Configuración y versionado de instrucciones.
7. Gestión de herramientas autorizadas.
8. Motor de ejecución.
9. Procesamiento documental.
10. Motor de automatizaciones.
11. Historial de ejecuciones.
12. Sistema de errores y reintentos.
13. Administración de integraciones.
14. Almacenamiento privado.
15. Dashboard central.
16. Auditoría.
17. Configuración general.
18. Monitoreo de consumos y costos.

Los agentes no deben tener bases independientes de usuarios, sistemas de autenticación propios ni permisos incompatibles.

Diseñá una arquitectura que permita incorporar agentes futuros sin reconstruir los componentes centrales.

El sistema debe poder procesar trabajos en segundo plano, sin depender de que un usuario tenga el navegador abierto.

---

## 4. Interfaz principal y experiencia de usuario

Desarrollá una interfaz profesional, moderna, clara y completamente responsive.

El nombre principal será:

**IA Workforce – Catena Zapata**

Debe integrarse visual y funcionalmente con el ecosistema existente de aplicaciones de Bodegas Esmeralda.

Implementá un menú lateral con:

- Inicio.
- Dashboard.
- Agentes.
- Crear agente.
- Órdenes de compra.
- Documentos.
- Automatizaciones.
- Ejecuciones.
- Historial.
- Integraciones.
- Base de conocimiento.
- Usuarios y permisos.
- Reportes.
- Auditoría.
- Configuración.

Cada módulo debe tener funcionalidades reales y un propósito definido.

La navegación no debe provocar recargas innecesarias, bloqueos ni pérdidas de información.

Implementá indicadores de carga, estados vacíos, mensajes claros de error, filtros, búsqueda, paginación y confirmaciones de acciones importantes.

No agregues botones decorativos o funcionalidades ficticias.

---

## 5. Gestión de agentes de IA

Desarrollá un módulo que permita crear y configurar agentes desde la interfaz.

Cada agente deberá tener:

- Nombre.
- Descripción.
- Área responsable.
- Estado: borrador, activo, pausado o deshabilitado.
- Instrucciones.
- Versión de instrucciones.
- Modelo de IA seleccionado.
- Proveedor de IA.
- Herramientas habilitadas.
- Fuentes de información autorizadas.
- Permisos necesarios.
- Parámetros de ejecución.
- Límites de consumo.
- Política de revisión humana.
- Historial de cambios.
- Registro de ejecuciones.
- Resultados.
- Errores.
- Responsable.
- Última ejecución.

Los usuarios autorizados deben poder modificar configuraciones dentro de límites seguros.

Las herramientas que permiten acceder a sistemas empresariales deben desarrollarse y aprobarse previamente. No permitas que las instrucciones de un agente generen permisos nuevos o ejecuten código arbitrario.

Prepará la plataforma para agentes futuros de Compras, Recursos Humanos, Calidad, Administración, Control Documental y Análisis de Información.

**El único agente empresarial que debe implementarse completamente en esta primera versión es el de órdenes de compra.**

Los demás podrán registrarse y configurarse, pero no deben presentarse como automatizaciones terminadas.

---

## 6. PRIMER AGENTE COMPLETO: ÓRDENES DE COMPRA

Este será el primer agente real y la prioridad funcional del desarrollo.

### 6.1. Recepción de órdenes por correo

Todos los clientes podrán enviar sus órdenes de compra a un buzón corporativo central, sin modificar necesariamente los destinatarios Customer y Comercial que utilizan actualmente.

Implementá integración con Microsoft Graph para:

- Conectarse al buzón autorizado.
- Detectar correos nuevos.
- Obtener el mensaje original.
- Descargar sus adjuntos.
- Identificar órdenes de compra.
- Asociar correos y archivos a una misma orden.
- Registrar remitente, asunto y fecha.
- Identificar el cliente.
- Detectar documentos duplicados.
- Registrar intentos y errores.
- Recuperar correos que no se hayan procesado.

La integración será exclusivamente de lectura.

El agente no debe enviar correos ni acceder a buzones distintos del autorizado.

Cuando las credenciales aún no estén configuradas, debe existir un conector de pruebas y un mecanismo de carga manual de órdenes para verificar el procesamiento.

### 6.2. Lectura y análisis documental

El agente debe reconocer:

- PDF con texto.
- PDF escaneados.
- Imágenes.
- Excel.
- Documentos Word.
- Órdenes con múltiples páginas.
- Diferentes formatos utilizados por distintos clientes.

Implementá un proceso que identifique automáticamente cómo procesar cada archivo.

Utilizá Cloudflare Workers AI para interpretar los datos y modelos de visión cuando el documento lo requiera.

Extraé:

- Número de orden.
- Cliente.
- Fecha de emisión.
- Fecha de entrega cuando corresponda.
- Código de producto.
- Descripción de producto.
- Cantidad.
- Unidad de medida.
- Precio unitario.
- Importe total.
- Moneda.
- Condiciones comerciales.
- Incoterm cuando corresponda.
- Observaciones.
- Información adicional necesaria para el ERP.

No inventes valores faltantes.

El agente debe detectar:

- Información ausente.
- Valores ilegibles.
- Inconsistencias.
- Productos no reconocidos.
- Datos ambiguos.
- Diferencias entre importes.
- Problemas de formato.
- Documentos duplicados.

Conservá el original y la información extraída.

Cada dato crítico debe tener su estado de validación y, cuando resulte técnicamente posible, su referencia al documento de origen.

No consideres una extracción como correcta únicamente porque el modelo devolvió una respuesta.

### 6.3. Integración con Loyal

Desarrollá el módulo que permita consultar el estado de aprobación de las fichas técnicas de los productos.

Debe poder identificar:

- Ficha aprobada.
- Ficha pendiente.
- Ficha rechazada.
- Ficha inexistente.
- Estado desconocido.
- Etapa actual.
- Última actualización.
- Motivo de bloqueo cuando exista.

**Una orden de compra solamente puede quedar habilitada cuando todas sus fichas técnicas estén aprobadas.**

Si un producto no cumple, la pantalla debe mostrar qué código lo está bloqueando y el estado correspondiente.

Nunca considerar una ficha como aprobada si Loyal no responde o no es posible confirmar su estado.

Si todavía no conocemos la API real de Loyal, creá el adaptador con contrato documentado y un proveedor de pruebas con datos sintéticos. No inventes endpoints reales.

La conexión productiva debe permanecer deshabilitada hasta configurarla y probarla.

### 6.4. Consulta de maestros del ERP

Prepará una integración de solo lectura para consultar, cuando estén disponibles:

- Clientes.
- Códigos de productos.
- Listas de precios.
- Monedas.
- Incoterms.
- Unidades de medida.
- Condiciones comerciales.
- Otros datos requeridos para el CSV.

No implementes escritura directa al ERP.

Si los datos se obtienen mediante archivos oficiales en lugar de API, desarrollá un mecanismo de importación controlado y versionado.

### 6.5. Generación de CSV

El sistema debe generar un CSV compatible con el formato oficial del ERP.

Las columnas, codificación, delimitadores, orden de campos y reglas deben configurarse conforme a un archivo de ejemplo validado.

Implementá:

- Previsualización.
- Validaciones comerciales.
- Comparación con la OC original.
- Correcciones manuales.
- Aprobación.
- Generación del archivo.
- Descarga.
- Registro de fecha y usuario.
- Historial de versiones.

Cuando el CSV esté generado, deberá quedar pendiente de carga manual.

**Sebastián será responsable de revisar y cargar el CSV al ERP.**

La aplicación solamente registrará la confirmación de esa tarea.

No debe ejecutarse ninguna importación automática al ERP.

### 6.6. Revisión humana

Implementá una pantalla donde los usuarios autorizados puedan comparar el documento original con los datos extraídos.

Debe permitir:

- Ver el documento.
- Consultar el contenido identificado.
- Corregir campos.
- Agregar observaciones.
- Revalidar una orden.
- Aprobar o rechazar.
- Consultar fichas técnicas.
- Generar el CSV.
- Revisar el historial.

Todos los cambios deben quedar auditados.

---

## 7. Dashboard y seguimiento de órdenes

Desarrollá un dashboard que muestre:

- Órdenes recibidas.
- Pendientes de análisis.
- En procesamiento.
- Con errores.
- Bloqueadas por Loyal.
- Pendientes de revisión.
- Aprobadas.
- Con CSV generado.
- Pendientes de carga al ERP.
- Finalizadas.

Cada orden deberá mostrar:

- Número de OC.
- Cliente.
- Fecha de recepción.
- Estado.
- Responsable.
- Productos.
- Fichas técnicas.
- Motivo de bloqueo.
- Tiempo en el estado.
- Última actualización.
- Acciones disponibles.

Permití filtrar por cliente, estado, fechas, responsable y producto.

El usuario debe poder ingresar a una orden y reconstruir su recorrido completo.

---

## 8. Login multifactor centralizado: requisito obligatorio

La aplicación debe funcionar como una aplicación más dentro de nuestro login multifactor central de Bodegas Esmeralda.

**No desarrolles un login independiente para producción.**

Antes de integrar, revisá el código o la documentación real del SSO existente.

Investigá:

- Autenticación.
- Sesiones.
- Tokens.
- Identificación de usuarios.
- Aplicaciones asignadas.
- Roles.
- Superadministrador.
- Cierre de sesión.
- Navegación entre aplicaciones.
- Revocación de acceso.

IA Workforce debe respetar el siguiente funcionamiento:

1. El usuario ingresa mediante el login central.
2. El SSO valida la identidad.
3. Se verifica si tiene IA Workforce asignada.
4. Si tiene autorización, accede.
5. Si no tiene autorización, se rechaza el ingreso.
6. Los permisos internos determinan qué módulos y acciones puede utilizar.

El superadministrador debe poder asignar o retirar el acceso desde el sistema central existente.

No dupliques contraseñas ni bases de usuarios.

Utilizá identificadores internos estables, evitando depender exclusivamente del correo electrónico.

Implementá roles internos configurables, incluyendo administrador, supervisor, responsable de procesos, operador, consulta y auditor.

Los permisos deben verificarse en cada operación del backend.

Si el SSO existente no está disponible para análisis, implementá el contrato de integración y un proveedor de identidad ficticio exclusivo de desarrollo, deshabilitado en producción. No presentes la integración como terminada.

**No modifiques el login existente ni las demás aplicaciones conectadas.**

---

## 9. Base de datos

Diseñá y desarrollá la base de datos completa.

Debe contemplar como mínimo:

- Identidades vinculadas al SSO.
- Roles.
- Permisos.
- Usuarios autorizados.
- Agentes.
- Configuraciones de agentes.
- Versiones de instrucciones.
- Herramientas.
- Integraciones.
- Órdenes de compra.
- Productos de las órdenes.
- Correos recibidos.
- Documentos.
- Extracciones documentales.
- Estados de fichas técnicas.
- Datos de referencia ERP.
- Aprobaciones.
- Correcciones.
- CSV generados.
- Automatizaciones.
- Ejecuciones.
- Errores.
- Auditoría.
- Configuración general.

Incluí migraciones, claves foráneas, índices, restricciones, controles de concurrencia e idempotencia.

No almacenes contraseñas ni claves privadas en las tablas de configuración visibles a los usuarios.

Los datos y documentos deben conservarse durante los períodos autorizados, con mecanismos de eliminación y retención.

---

## 10. Automatizaciones y ejecución en segundo plano

Implementá procesos mediante Cloudflare Queues, Workflows y Cron Triggers.

Los trabajos deben poder:

- Iniciarse automáticamente.
- Continuar sin navegador abierto.
- Conservar su estado.
- Recuperarse ante interrupciones.
- Reintentarse ante errores transitorios.
- Evitar procesamiento duplicado.
- Detenerse cuando exista un error definitivo.
- Esperar revisión humana.
- Registrar sus resultados.
- Generar alertas internas.

Los trabajos fallidos deben tener mecanismos de recuperación y reprocesamiento controlado.

No pierdas documentos ni estados de órdenes por una interrupción del servidor.

---

## 11. Seguridad empresarial

Implementá controles de seguridad desde la arquitectura inicial.

Incluí:

- Validación de autenticación centralizada.
- Permisos por recurso y acción.
- Mínimo privilegio.
- Cifrado en tránsito.
- Cifrado de almacenamiento.
- Secretos separados del código.
- Sesiones seguras.
- Protección frente a acceso indebido a otros registros.
- Auditoría de operaciones.
- Protección frente a archivos maliciosos.
- Validación del contenido de archivos.
- Límites de tamaño y tipo de archivo.
- Protección contra inyección de instrucciones en documentos.
- Protección contra ejecución de herramientas no autorizadas.
- Backups.
- Recuperación ante fallos.
- Separación de ambientes.
- Políticas de retención.
- Eliminación controlada de documentos.

No envíes información confidencial a proveedores externos no aprobados.

Para Cloudflare AI Gateway, evitá almacenar documentos, prompts y respuestas sensibles en logs o cachés innecesarias.

La IA no puede otorgarse permisos ni tomar decisiones comerciales fuera de las reglas implementadas.

Prepará una evaluación de seguridad y protección de datos conforme a los requisitos aplicables en Argentina, incluida la Ley 25.326, diferenciando controles técnicos de requisitos legales y organizacionales pendientes de aprobación.

---

## 12. Administración, auditoría y monitoreo

Desarrollá pantallas para consultar:

- Ejecuciones de agentes.
- Duración.
- Resultados.
- Errores.
- Reintentos.
- Cantidad de documentos.
- Consumo de IA.
- Modelo utilizado.
- Costo estimado por ejecución.
- Responsable.
- Historial de cambios.
- Acciones humanas.
- Eventos de integración.

El dashboard debe permitir conocer qué agente ejecutó una acción, cuándo, con qué resultado y por qué una orden quedó bloqueada.

La auditoría debe ser resistente a modificaciones no autorizadas.

---

## 13. Pruebas obligatorias

No alcanza con que el proyecto compile.

Implementá y ejecutá pruebas que cubran:

**Frontend**
- Navegación.
- Formularios.
- Validaciones.
- Filtros.
- Permisos visuales.
- Diseño responsive.
- Estados de carga y errores.

**Backend**
- Endpoints.
- Autorización.
- Errores.
- Concurrencia.
- Validación de entradas.

**Base de datos**
- Migraciones.
- Relaciones.
- Transacciones.
- Integridad de registros.

**Agente de compras**
- Lectura documental.
- Extracción de información.
- Duplicados.
- Documentos incompletos.
- Estados de Loyal.
- Bloqueos.
- Correcciones.
- CSV.

**Seguridad**
- Acceso sin autorización.
- Intentos de acceder a datos de otro usuario.
- Acciones con permisos insuficientes.
- Documentos maliciosos.
- Instrucciones maliciosas dentro de las OC.
- Prohibición de escritura al ERP.

**Integraciones**
- Microsoft Graph con entorno de pruebas.
- Adaptador de Loyal.
- Adaptador del ERP.
- Adaptador del SSO.

Incluí pruebas automatizadas y datos sintéticos para poder verificar los procesos sin conectarse a sistemas productivos.

Indicá cuáles fueron ejecutadas, cuáles aprobaron, cuáles fallaron y cuáles requieren acceso externo.

No informes como probada una integración real si solamente se verificó con datos simulados.

---

## 14. Organización del código

Organizá el proyecto con una estructura profesional que separe:

- Aplicación frontend.
- Backend/API.
- Componentes compartidos.
- Agentes.
- Servicios de procesamiento documental.
- Integraciones.
- Base de datos.
- Migraciones.
- Configuración de Cloudflare.
- Pruebas.
- Documentación.
- Scripts de desarrollo y despliegue.

Evitá archivos gigantes que mezclen toda la lógica.

Mantené contratos de API documentados, interfaces tipadas, errores normalizados y dependencias versionadas.

Prepará el proyecto para incorporar nuevos agentes y módulos.

---

## 15. Entrega obligatoria: ZIP COMPLETO

Este punto es fundamental.

**Una vez desarrollado y verificado el proyecto, generá un único archivo llamado:**

`IA_WORKFORCE_CATENA_ZAPATA_COMPLETO.zip`

El ZIP debe incluir:

1. Todo el código fuente del frontend.
2. Todo el código fuente del backend.
3. Código de los agentes.
4. Servicios Python de procesamiento documental.
5. Configuración de Cloudflare.
6. Configuración de Supabase.
7. Migraciones SQL.
8. Definiciones y contratos de API.
9. Scripts de instalación.
10. Scripts de compilación.
11. Configuración de entornos.
12. Archivos `.env.example` sin credenciales reales.
13. Archivos de dependencias y lockfiles.
14. Dockerfiles cuando correspondan.
15. Configuraciones de colas y procesos.
16. Pruebas automatizadas.
17. Datos sintéticos de prueba.
18. Documentación técnica.
19. Manual de usuario.
20. Manual de administrador.
21. Instrucciones de despliegue.
22. Checklist de seguridad.
23. Resultados de pruebas.
24. Listado de integraciones pendientes de configurar.
25. Registro de limitaciones conocidas.

No incluyas contraseñas, claves API, tokens, secretos productivos ni información empresarial sensible.

No incluyas `node_modules`, entornos virtuales ni dependencias regenerables que inflen innecesariamente el archivo.

El ZIP debe representar el proyecto completo y reproducible, no una selección parcial de archivos.

### Validación del ZIP

Antes de entregarlo:

- Comprobá que el archivo existe.
- Verificá que se puede descomprimir.
- Comprobá que contiene todos los componentes.
- Ejecutá las instalaciones y compilaciones que permita el entorno.
- Ejecutá las pruebas disponibles.
- Revisá que no existan secretos.
- Verificá que las migraciones se puedan aplicar en una base de pruebas.
- Documentá los resultados y los pasos necesarios para ejecutar el proyecto.

Entregá un enlace directo de descarga del ZIP generado.

Si alguna dependencia externa impide realizar una prueba o completar una integración, documentá la limitación de manera específica.

No afirmes que el sistema está funcionando en producción si no se pudo probar en ese entorno.

---

## 16. Despliegue

Prepará todo lo necesario para desplegar IA Workforce en nuestra infraestructura Cloudflare.

Incluí instrucciones y configuraciones para:

- Frontend.
- API.
- Containers.
- Workers AI.
- AI Gateway.
- R2.
- Queues.
- Workflows.
- Supabase.
- Microsoft Graph.
- SSO central.
- Secrets.
- Dominio corporativo.
- Monitoreo.

Prepará entornos separados de desarrollo, pruebas y producción.

**No ejecutes un despliegue productivo ni modifiques aplicaciones existentes sin autorización explícita.**

---

## 17. Forma de trabajo y criterios de finalización

Trabajá con el siguiente orden:

1. Analizar los documentos y el código existente que se hayan proporcionado.
2. Detectar dependencias y accesos faltantes.
3. Definir la arquitectura y estructura del repositorio.
4. Construir la plataforma central.
5. Implementar base de datos y permisos.
6. Implementar administración de agentes.
7. Desarrollar el agente completo de órdenes de compra.
8. Implementar procesamiento documental.
9. Integrar los servicios Cloudflare.
10. Implementar adaptadores externos.
11. Construir dashboard, historial y auditoría.
12. Implementar seguridad y monitoreo.
13. Ejecutar pruebas.
14. Corregir errores encontrados.
15. Generar y verificar el ZIP completo.

Durante el desarrollo, conservá un registro de decisiones técnicas, pruebas y funcionalidades completadas.

No reemplaces funcionalidades complejas por simulaciones sin advertirlo.

Priorizá un sistema verificable y mantenible frente a uno que solamente parezca terminado.

Si existen limitaciones técnicas, documentá exactamente qué impiden completar y entregá la parte funcional correspondiente.

---

## 18. Resultado que espero recibir

Al finalizar necesito:

**A. Aplicación completa**

Una plataforma IA Workforce con frontend, backend, base de datos, administración, agentes, permisos, automatizaciones y auditoría implementados.

**B. Primer agente desarrollado**

El agente de órdenes de compra, incluyendo lectura, extracción, validaciones, consulta de Loyal mediante adaptador, revisión humana y generación de CSV.

**C. Integración de identidad preparada**

Conexión con el SSO central cuando estén disponibles sus contratos y accesos reales, sin duplicar autenticación.

**D. Infraestructura Cloudflare preparada**

Configuraciones reproducibles para despliegue y ejecución.

**E. Pruebas y documentación**

Evidencia de funcionamiento, resultados de pruebas y limitaciones conocidas.

**F. Archivo ZIP completo**

`IA_WORKFORCE_CATENA_ZAPATA_COMPLETO.zip`

Con todo el proyecto fuente, migraciones, configuraciones, scripts, pruebas, documentación y manuales.

---

# CONDICIÓN FINAL

Quiero un producto empresarial propio, no una imitación visual de Quilsoft.

Debe permitir desarrollar progresivamente nuestro ecosistema de agentes de inteligencia artificial, comenzando por Compras y posteriormente ampliándose a otras áreas de Catena Zapata.

**La prioridad es que el sistema sea funcional, seguro, auditable, escalable, mantenible y completamente integrable con nuestro login multifactor y nuestra infraestructura empresarial.**

No inventes integraciones, pruebas, accesos ni resultados.

No modifiques producción.

**Desarrollá los componentes que puedan verificarse, documentá las dependencias pendientes y entregá el ZIP completo y reproducible con el resultado real del trabajo.**