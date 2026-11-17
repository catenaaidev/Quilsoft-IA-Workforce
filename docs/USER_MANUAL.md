# Manual de usuario — versión de pruebas

1. Acceder desde el login multifactor central de Bodegas Esmeralda **cuando esté conectado y se haya asignado IA Workforce**. Sin asignación, el sistema deniega acceso.
2. En **Órdenes de compra**, elegir «Nueva orden» para carga manual de una orden o consultar las existentes. Los datos son requeridos para la validación.
3. Abrir una orden, adjuntar PDF, imagen, Excel, Word, TXT o CSV (máximo 12 MB). El análisis se hace de forma asíncrona; la extracción no acredita aprobación.
4. En el detalle, revisar el original y los datos extraídos; corregir campos de cabecera o producto si es necesario. Toda corrección invalida el estado de ficha técnica hasta nueva consulta.
5. Pulsar **Consultar Loyal**. Si hay ficha pendiente, rechazada, ausente o desconocida, la OC queda bloqueada. En esta entrega la conexión real a Loyal no está configurada, por lo que no existe aprobación productiva.
6. Una vez homologada la integración, usuarios autorizados podrán aprobar si todos los campos y fichas técnicas pasan las validaciones.
7. Generar y descargar CSV solo si existe un modelo oficial validado. **Sebastián debe cargarlo manualmente al ERP**. La plataforma no envía ni importa datos al ERP.
8. Registrar «Confirmar carga manual» con una referencia de operación una vez verificada la carga externa.
9. Consultar **Ejecuciones**, **Documentos** y **Auditoría** para resolver bloqueos, errores y conocer el recorrido de cada orden.

No adjuntar información innecesaria. Informar documentos ilegibles al responsable y no forzar aprobaciones. Si la carga no se visualiza, revisar la integración y los estados antes de duplicarla.
