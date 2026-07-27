# Vínculo manual de PDF por diseño (Diseños)

Estado: **implementado y en producción** (2026-07-09). Leer antes de tocar `refreshDesignPdfLinks`, `manualPdfMatchFor`, o el flujo de "Vincular PDFs" en `app/admin/page.js`, o antes de asumir que el emparejamiento diseño↔PDF es siempre automático.

## Qué resuelve

El emparejamiento automático de diseño↔PDF (fuzzy match por nombre contra los archivos que el Bridge escaneó en las carpetas configuradas) a veces falla o elige el archivo equivocado. Esto agrega un botón "🎯" (al lado del ícono de vincular ya existente, en la fila de cada diseño en la pestaña Diseños) para fijar a mano, por diseño, exactamente qué archivo le corresponde — eligiendo de una lista buscable de todos los PDFs ya escaneados por el Bridge, sin tener que usar el explorador de archivos del sistema operativo (que no sirve para esto: un navegador no puede quedarse con una referencia persistente a un archivo elegido por diálogo nativo).

## Cómo funciona

- **`/pdf-catalog` del Bridge, recién conectado**: el Bridge ya tenía este endpoint, que devuelve la lista completa de PDFs escaneados (nombre, carpeta, tamaño), con su función cliente correspondiente (`getBridgePdfCatalog` en `lib/print-bridge-client.js`) — pero nadie lo llamaba desde ninguna pantalla hasta este cambio. El picker nuevo es el primer consumidor real de ese endpoint.
- **`designs`** tiene 3 columnas nuevas: `manual_pdf_root_name`, `manual_pdf_relative_path`, `manual_pdf_file_name` (`sql/design_manual_pdf_link.sql`). Se guardan por diseño, no por PC/operario — el vínculo manual es global, no depende de qué computadora lo cargó.
- **`manualPdfMatchFor(design)`** (helper en `app/admin/page.js`) arma un objeto con la MISMA forma que devuelve el Bridge al hacer matching automático (`{id, name, found, matchType, score, fileName, rootName, relativePath, ...}`), con `matchType: 'manual'` para poder distinguirlo. Esto es clave: el resto del código (badges, tooltips, impresión en Producción) no necesita saber si un match vino del Bridge o fue fijado a mano, porque tiene la misma forma.
- **`refreshDesignPdfLinks`** (la función que ya existía y llama a `matchBridgeDesignPdfs`) ahora, después de recibir los matches automáticos del Bridge, **pisa** con el vínculo manual cualquier diseño que lo tenga configurado — el manual siempre gana sobre el automático.

## Consumo en Produccion y Operarios

Desde 2026-07-27, Produccion y Operarios ya no usan solamente el match puntual por nombre del pedido para mostrar/imprimir PDFs. Primero resuelven por `design_id` contra el mismo mapa que ve Disenos (`designPdfMatches` en Admin) o contra el escaneo global de `designs` en Operarios; despues aplican el vinculo manual guardado en `designs`; recien al final usan el match automatico puntual del pedido como fallback.

Esto evita falsos positivos cuando una tarea/pedido conserva un nombre ambiguo o viejo (por ejemplo `Misiones`) y el Bridge elegiria por parecido otro archivo (`Misiones 2`). Si el match efectivo ya trae `rootName` + `relativePath`, los botones de imprimir usan `/print-direct`, para imprimir exactamente ese PDF en vez de pedirle al Bridge que vuelva a matchear por nombre.

## Archivos involucrados

- `sql/design_manual_pdf_link.sql` — migración (3 columnas nuevas en `designs`). Ya aplicada.
- `app/admin/page.js` — todo el resto: `manualPdfMatchFor`, `openPdfPicker`/`closePdfPicker`/`saveManualPdfLink`/`clearManualPdfLink`, el botón "🎯" en la fila del diseño, el modal del picker.
- `components/ProductionTab.js` — consume `designPdfMatches` por `design_id`, muestra la columna `PDF vinculado` en el detalle de pedido y usa `/print-direct` cuando el match ya tiene ruta exacta.
- `app/operarios/page.js` — replica el criterio por `design_id` con el escaneo global de `designs` y usa `/print-direct` para imprimir PDFs ya resueltos.
- `lib/print-bridge-client.js` — `getBridgePdfCatalog` ya existía, ahora tiene un consumidor real.
- `bridge/Inkora.PrintBridge/Services/LocalApiServer.cs` (`/pdf-catalog`) — no se tocó, ya estaba implementado del lado del Bridge.
