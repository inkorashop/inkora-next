# Bitacora de turnos de trabajo IA

El archivo de entrada unico para iniciar trabajo en este proyecto es `AGENTS.md`.

Si una IA abre primero esta bitacora, debe volver a `AGENTS.md`, seguir el protocolo de arranque, leer `CONTEXT.md`, auditar la ultima entrada y recien despues trabajar.

Agregar cada nueva entrada arriba de todo, debajo de esta introduccion.

Formato obligatorio:

## YYYY-MM-DD HH:mm -03:00 - IA

- Objetivo:
- Cambios:
- Verificacion:
- Auditoria:
- Pendiente/Riesgos:

---

## 2026-07-04 -03:00 - Claude Sonnet 5 (v2)

- Objetivo: Crear una app nativa Android (aparte de la PWA) que agregue una "burbuja flotante" tipo chat-head sobre otras apps (imposible en PWA por sandboxing) y se auto-actualice via wifi sin Play Store.
- Cambios: Nueva carpeta `android-app/` (proyecto Gradle/Kotlin separado, minSdk 26, compileSdk 34): `MainActivity.kt` con un WebView que carga `https://www.inkora.com.ar/` (asi la web sigue siendo la unica fuente de UI/logica, sin duplicar nada) + puente JS `AndroidBridge.activateFloating()`; `FloatingBubbleService.kt` implementa el icono flotante arrastrable (`TYPE_APPLICATION_OVERLAY`) que expande/colapsa una vista compacta con otro WebView; `UpdateManager.kt` chequea `/api/app-version`, descarga el APK con `DownloadManager` y dispara el instalador del sistema (un toque de "Instalar" es inevitable sin MDM) + `PackageReplacedReceiver.kt` reabre la app sola despues de actualizarse. Se genero un keystore de firma propio (`android-app/keystore/`, fuera de git) y se instalaron JDK 17, Android Studio y el SDK de Android (cmdline-tools, platform-tools, platform 34, build-tools 34) en esta PC via winget/sdkmanager. Del lado de Next.js: nuevo endpoint publico `app/api/app-version/route.js` (lee de la tabla `settings`) y un boton "Activar flotante" en `components/Header.js` (solo visible cuando `window.AndroidBridge` existe, o sea corriendo dentro de esta app nativa, no en el navegador).
- Verificacion: `./gradlew assembleRelease` compila y firma un APK release valido (`android-app/app/build/outputs/apk/release/app-release.apk`, verificado con `apksigner verify`); `npx next build` del sitio sigue sin errores.
- Auditoria: Se investigaron limitaciones reales de plataforma antes de proponer nada (una PWA no puede dibujar overlays sobre otras apps ni auto-instalarse sin toque del usuario, son restricciones de seguridad de Android/iOS, no arbitrarias). El usuario eligio explicitamente: solo Android, sin Google Play, actualizador propio con un toque de "Instalar" inevitable.
- Pendiente/Riesgos: Ejecutar en Supabase `sql/android_app_version.sql` (agrega las 3 keys de version a `settings`). Falta decidir donde alojar los APKs de futuras versiones (ej. bucket de Supabase Storage) y cargar esa URL en `android_app_apk_url` cada vez que se compile una version nueva del cascaron nativo. El keystore (`android-app/keystore/inkora-app.jks` + `keystore.properties`) vive solo en este disco, fuera de git: si se pierde no se puede volver a firmar/actualizar esta instalacion especifica, hay que guardarlo a resguardo (ej. backup cifrado aparte). Falta la instalacion inicial real en un celular de prueba (no pude verificar visualmente la burbuja en un dispositivo real).

---

## 2026-07-04 -03:00 - Claude Sonnet 5

- Objetivo: (1) Agrupar por producto + resumen de unidades en el mensaje de confirmacion de WhatsApp; (2) eliminar el beep repetido del microfono al cargar pedidos por voz en celular; (3) evitar que se pierda audio al hablar justo despues de decir "siguiente"; (4) diagnosticar (sin tocar) el flujo de confirmacion de pedido -> email en busca de errores de cantidades/precios; (5) diagnosticar (sin tocar) toda la app en busca de errores/parches, y luego, con la aprobacion del usuario sobre ese diagnostico, corregir los items de prioridad alta y media que el usuario aprobo explicitamente.
- Cambios: `app/catalogo/page.js` ahora arma el mensaje de WhatsApp con `buildWhatsAppConfirmationMessage` (agrupado por producto en el orden elegido + resumen de unidades si hay mas de un producto) y agrega una suscripcion realtime a `price_tiers` (`loadPriceTiersForUser`). `components/CreateOrderModal.js` cambia el reconocimiento de voz a `continuous=true` con `interimResults`, evitando el reinicio (que causaba el beep) y la perdida de audio entre comandos. Alta prioridad aprobada: `lib/admin-api-auth.js` gano `requireAdminOrOperator` (Bearer+cookie, admins+operarios activos) y se aplico en `/api/bridge-config` y `/api/upload-image` (antes sin auth real); se creo `lib/supabase-admin.js` con `getAdminClient()` unico y se migraron ~11 rutas API que lo reimplementaban; `sql/app_config.sql` elimino la policy `authenticated_read` que exponia `bridge_token`; `components/Header.js` corrige el badge del carrito (mostraba "1" fijo); `app/dashboard/page.js` usa el estado de pedido compartido (le faltaban `in_production`/`ready`). Media prioridad aprobada: `lib/fuzzy-match.js` corrigio el regex de acentos roto; se elimino codigo muerto y las flags `useProductManagementModals`/`inviteOpen` hardcodeadas en `true` en `app/admin/page.js` (incluido un bloque de ~250 lineas de UI de categorias/escalas ya reemplazado por los modales); se creo `lib/order-status.js` como fuente unica de label/color de estado de pedido (usado por `Header.js`, `dashboard/page.js` y `lib/chat-helpers.js` via re-export) y `lib/slug.js` como `toSlug` unico (usado por `app/page.js`, `app/catalogo/page.js`, `app/admin/page.js`). Se agrego `sql/price_tiers_realtime_enable.sql` para habilitar Realtime sobre `price_tiers`.
- Verificacion: `npx eslint` sobre todos los archivos tocados sin errores; `npx next build` completo sin errores (solo warnings preexistentes de `<img>`/`exhaustive-deps` no relacionados).
- Auditoria: Se audito todo el repo antes de tocar nada (puntos 4 y 5 fueron solo diagnostico en un primer turno); recien en un turno posterior el usuario aprobo explicitamente que hallazgos corregir. Antes de tocar `/api/bridge-config` y `/api/upload-image` se greppearon todos los callers reales (incluyendo `app/operarios/page.js` y `components/chat/ChatPanel.js`) para no romper el acceso de operarios ni del chat. Se verifico compatibilidad de `requireAdmin` con sus ~11 call sites antes de cambiar su forma de retorno. No se toco `app/api/send-email/route.js` (su `getAdminClient()` tiene un contrato de error distinto, se dejo afuera a proposito).
- Pendiente/Riesgos: Ejecutar manualmente en Supabase SQL Editor `sql/app_config.sql` (saca la policy vieja) y `sql/price_tiers_realtime_enable.sql` (sin esto la suscripcion realtime de precios no recibe eventos aunque el codigo este bien) — un deploy de codigo no corre SQL. Diagnostico 4 quedo con 2 puntos sin tocar por decision explicita del usuario: la agregacion de cantidades por variante en `getUnitPrice`/`getProductMinQty` (bug real pero de impacto bajo, no es dinero de pasarela) y la discrepancia CONTEXT.md vs codigo sobre `user_product_localities` (el usuario confirmo que el comportamiento correcto es el del codigo; CONTEXT.md quedo desactualizado y no se corrigio su texto). Diagnostico 5 aun tiene pendientes de prioridad baja no pedidos en este turno.

---

## 2026-07-04 09:41 -03:00 - ChatGPT Codex

- Objetivo: Ajustar UX de optimizacion en Disenos: persistir el objetivo de KB, quitar el boton grande de optimizar y mostrar Original/Optimizada sin objetivo.
- Cambios: Se actualizo `app/admin/page.js` para guardar `Miniatura` en `localStorage`, quitar el boton bulk del encabezado y dejar solo los botones inline, enviar `sourceSizeKb` al optimizar y mostrar `Original X KB / Optimizada Y KB`. Se extendio `app/api/admin/design-optimized-image/route.js` para guardar el peso original cuando la columna exista y reintentar sin bloquear si falta. Se extendio `app/api/admin/design-image-summary/route.js` para devolver tamanos por diseno desde Storage. Se agrego `optimized_image_source_size_kb` a `sql/design_optimized_images.sql`.
- Verificacion: `node --check app\admin\page.js` OK; `node --check app\api\admin\design-optimized-image\route.js` OK; `node --check app\api\admin\design-image-summary\route.js` OK; `git diff --check` OK con avisos CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se reviso la entrada anterior y el estado real del repo. El ultimo deploy estaba en `77d1f93`; se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Ejecutar nuevamente `sql/design_optimized_images.sql` en Supabase para agregar `optimized_image_source_size_kb`; si no se ejecuta, la optimizacion sigue funcionando por fallback pero el peso original no queda persistido en DB para futuras recargas.

---

## 2026-07-04 09:33 -03:00 - ChatGPT Codex

- Objetivo: Corregir en Admin > Disenos que al hacer click en espacio vacio se suelte la seleccion.
- Cambios: Se ajusto `app/admin/page.js` para distinguir entre zona seleccionable de la fila, controles de la derecha y espacios vacios. Ahora el hueco visual de la fila y el fondo de la lista limpian `selectedIds`, mientras que la info del diseno sigue seleccionando normalmente.
- Verificacion: `node --check app\admin\page.js` OK; `git diff --check` OK con avisos CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se reviso la entrada anterior y se confirmo que el cambio previo estaba desplegado en `8a96de1`, pero no cubria el espacio vacio dentro del ancho de una fila. Se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Probar manualmente en produccion haciendo click en el hueco entre la info del diseno y los botones, y debajo de la lista.

---

## 2026-07-04 09:15 -03:00 - ChatGPT Codex

- Objetivo: Corregir el error de suma de pesos en Disenos, permitir soltar seleccion con click en espacio vacio y mejorar el visor de miniaturas con imagen mas grande y zoom con rueda.
- Cambios: Se actualizo `app/api/admin/design-image-summary/route.js` para calcular tamanos con Supabase Storage API en vez de consultar el schema SQL `storage`, evitando `Invalid schema: storage`. Se ajusto `app/admin/page.js` para que la lista de Disenos tenga area vacia clickeable que limpia seleccion, y para que el modal abra al 130%, permita zoom in/out con rueda y mantenga los controles fijos.
- Verificacion: `node --check app\admin\page.js` OK; `node --check app\api\admin\design-image-summary\route.js` OK; `git diff --check` OK con avisos CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se reviso la entrada anterior y el estado real del repo. El deploy anterior estaba aplicado en `9481d57`; se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Ejecutar `sql/design_optimized_images.sql` en Supabase si aun no se aplico. El resumen depende de que Storage API devuelva metadata de tamanos para los objetos del bucket `assets`.

---

## 2026-07-04 08:49 -03:00 - ChatGPT Codex

- Objetivo: Ajustar la experiencia de miniaturas optimizadas en Diseños: cursor de mano, preview original/optimizada sin nueva pestaña y barra inferior de resumen estilo Excel.
- Cambios: Se actualizo `app/admin/page.js` para que la miniatura tenga cursor pointer, el modal abra primero la imagen original y permita alternar ahi mismo entre Original y Optimizada. Se agrego una barra inferior sticky en Diseños con tres valores siempre visibles: recuento, peso total de originales y peso total de optimizadas, aplicada a total/filtro/seleccion. Se agrego `app/api/admin/design-image-summary/route.js`, que calcula pesos desde metadata de Supabase Storage sin descargar las imagenes completas.
- Verificacion: `node --check app\admin\page.js` OK; `node --check app\api\admin\design-image-summary\route.js` OK; `git diff --check` OK con avisos CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables por `<img>` en previews.
- Auditoria: Se reviso la entrada anterior de optimizacion y el estado real del repo. El commit anterior `3683cf2` ya estaba aplicado; quedaron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Ejecutar `sql/design_optimized_images.sql` en Supabase antes de usar Optimizar. La barra de resumen depende de que la metadata de Storage tenga tamanos; si algun objeto no reporta size, no suma ese archivo.

---

## 2026-07-04 08:31 -03:00 - ChatGPT Codex

- Objetivo: Agregar optimizacion masiva y por fila de miniaturas desde Admin > Diseños, conservando originales y usando optimizadas en la web.
- Cambios: Se agrego `sql/design_optimized_images.sql` con columnas `optimized_image_*`. Se creo `app/api/admin/design-optimized-image/route.js` para guardar miniaturas optimizadas con validacion admin, borrar la optimizada anterior del mismo diseño y mantener `image_url`/`model_url` originales. Se agrego `lib/design-image-url.js` y se actualizo `app/admin/page.js` para comprimir en navegador a un objetivo editable en KB, procesar seleccion multiple o fila individual, mostrar estado por diseño, usar preview optimizada en la fila y abrirla en grande. Se actualizo `app/catalogo/page.js`, `components/DesignThumb.js` y la miniatura local de `app/operarios/page.js` para preferir `optimized_image_url` cuando exista. Siguen presentes los cambios pendientes previos de realtime en `components/ProductionTab.js`, `app/operarios/page.js` y `sql/production_realtime_enable.sql`.
- Verificacion: `node --check app\admin\page.js` OK; `node --check app\catalogo\page.js` OK; `node --check app\operarios\page.js` OK; `node --check components\DesignThumb.js` OK; `node --check app\api\admin\design-optimized-image\route.js` OK; `node --check lib\design-image-url.js` OK; `npm.cmd run build` OK con warnings preexistentes y nuevos warnings esperables por `<img>` en previews admin.
- Auditoria: Se reviso la entrada anterior y el estado real del repo. Se confirmo que el turno anterior no habia podido commitear/deployar por permisos/red; sus cambios siguen en el arbol. Se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Ejecutar en Supabase SQL Editor `sql/design_optimized_images.sql` antes de usar el boton Optimizar; si no, la API devuelve aviso de SQL faltante. Hacer commit/deploy si el entorno lo permite.

---

## 2026-07-03 22:59 -03:00 - ChatGPT Codex

- Objetivo: Corregir que las cantidades impresas/troqueladas/desperdicio no se actualicen entre PCs aunque los botones ya no se bloqueen.
- Cambios: Se agrego refresco silencioso cada 2.5s en `components/ProductionTab.js` y `app/operarios/page.js`, solo con la pestana visible y sin activar loaders ni bloquear inputs. Se conserva Realtime como camino principal y el polling queda como respaldo si Supabase Realtime no esta aplicado o se corta. En `/operarios` el claim de operario queda cacheado para no ejecutarse en cada refresco. Se agrego `sql/production_realtime_enable.sql` para verificar/habilitar `production_order_tasks` en la publicacion `supabase_realtime`.
- Verificacion: `node --check components\ProductionTab.js` OK; `node --check app\operarios\page.js` OK; `git diff --check` OK con avisos CRLF preexistentes; `npm.cmd run build` OK con warnings preexistentes.
- Auditoria: Se reviso la entrada anterior sobre cantidades en vivo y se confirmo que la RPC atomica seguia pendiente de aplicar en Supabase por falta de `SUPABASE_ACCESS_TOKEN`. Se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Ejecutar en Supabase SQL Editor `sql/production_realtime_enable.sql` para solucionar la causa de fondo de Realtime. El deploy web incluye fallback liviano, por lo que las PCs deberian sincronizar aunque Realtime todavia no emita eventos.

---

## 2026-07-03 22:35 -03:00 - ChatGPT Codex

- Objetivo: Hacer que las cantidades impresas/troqueladas/desperdicio se actualicen rapido y en vivo entre PCs sin pisarse.
- Cambios: Se ajusto `components/ProductionTab.js` y `app/operarios/page.js` para que los controles de cantidad no bloqueen la UI mientras guardan, usen cola por tarea, manden parches reales con `NULL` en campos no tocados y apliquen realtime puntual por fila en vez de recargar toda la lista en cada update. Los botones `+/-` ahora intentan usar la nueva RPC atomica `increment_production_task_counter` y cachean fallback si la RPC aun no existe. Se agrego esa RPC a `sql/production_task_progress_partial_updates.sql` y `sql/production_orders_and_operators.sql`.
- Verificacion: `node --check components\ProductionTab.js` OK; `node --check app\operarios\page.js` OK; `git diff --check` OK con avisos CRLF; `npm.cmd run build` OK con warnings preexistentes. Se intento aplicar `npx.cmd supabase db query --linked --file sql\production_task_progress_partial_updates.sql`, pero Supabase CLI pidio `SUPABASE_ACCESS_TOKEN` y no habia variables `SUPABASE*` cargadas.
- Auditoria: Se reviso el turno anterior del Bridge `1.6.5` y el estado real del repo. Se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Ejecutar en Supabase SQL Editor `sql/production_task_progress_partial_updates.sql` para activar la RPC atomica. Sin ese SQL, la UI queda mas rapida y compatible por fallback, pero dos PCs haciendo `+/-` exactamente al mismo tiempo no tienen garantia atomica completa.

---

## 2026-07-03 22:04 -03:00 - ChatGPT Codex

- Objetivo: Implementar una correccion definitiva para que la impresion de pedidos detecte SumatraPDF y respete copias multiples.
- Cambios: Se subio el Bridge a `1.6.5`. `PrintJobService` ahora busca `SumatraPDF.exe` junto al ejecutable real, en la carpeta estable `%LOCALAPPDATA%\Inkora\PrintBridge\app`, en `AppContext`, cwd, Program Files y PATH, y expone las rutas revisadas en `/health`. El auto-update y `install.ps1` ahora instalan siempre en esa carpeta estable, copian el paquete completo, verifican Sumatra, registran `inkora-bridge://`, configuran auto-inicio e inician el Bridge. `build-release.ps1` incluye instalador y README dentro del ZIP. La web apunta a `bridge-v1.6.5`.
- Verificacion: `node --check components\ProductionTab.js` OK; `node --check app\operarios\page.js` OK; `dotnet build bridge\Inkora.PrintBridge\Inkora.PrintBridge.csproj` OK; `powershell -NoProfile -ExecutionPolicy Bypass -File bridge\build-release.ps1 -Version 1.6.5` OK y genero ZIP con exe, Sumatra, `install.ps1`, `install.bat` y README; `install.ps1` parsea OK; `npm.cmd run build` OK con warnings preexistentes; `git diff --check` OK con avisos CRLF. Se pusheo `bridge-v1.6.5`, el asset GitHub `Inkora.PrintBridge.zip` responde `200`, y Vercel quedo `READY` en produccion sin logs de error recientes.
- Auditoria: Se confirmo que el Bridge activo fallaba porque `/health` decia `sumatraPdf: false` aunque `SumatraPDF.exe` estaba junto al exe en Descargas. La causa probable era busqueda basada en `AppContext.BaseDirectory` en un publish single-file, no en la ruta real del proceso. Se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Probar fisicamente actualizar el Bridge desde la web e imprimir un pedido con 7 copias; si la Epson sigue forzando el preset de 1 copia, revisar DEVMODE/preset de driver, pero el Bridge ya deberia usar Sumatra y enviar `Nx` como un unico trabajo.

---

## 2026-07-03 18:27 -03:00 - ChatGPT Codex

- Objetivo: Corregir que dos PCs se pisen al editar cantidades impresas/troqueladas/desperdicio en produccion.
- Cambios: Se ajusto `components/ProductionTab.js` y `app/operarios/page.js` para guardar parches parciales por tarea y, justo antes de llamar la RPC, leer la fila fresca de DB para completar los campos no tocados. Esto evita reenviar contadores viejos desde otra PC y es compatible con la funcion SQL vieja y nueva. Se actualizo `sql/production_orders_and_operators.sql` y se agrego `sql/production_task_progress_partial_updates.sql` como mejora idempotente para que la DB soporte `NULL` = "no tocar este campo". Tambien se alineo `/operarios` al Bridge `1.6.3`.
- Verificacion: `node --check components\ProductionTab.js` OK; `node --check app\operarios\page.js` OK; `CI=true npm.cmd run build` OK con warnings preexistentes; `git diff --check` OK con avisos CRLF. Se intento aplicar SQL con `npx supabase db query --linked --file sql\production_task_progress_partial_updates.sql`, pero Supabase CLI pidio `SUPABASE_ACCESS_TOKEN`; queda como mejora opcional, no bloquea deploy.
- Auditoria: Se reviso la entrada anterior sobre Bridge/release y el estado del repo. Se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Desplegar al cerrar este turno y probar con dos PCs editando columnas distintas de la misma tarea. Si se quiere blindar tambien el caso de dos escrituras simultaneas al mismo milisegundo, ejecutar luego en Supabase SQL Editor `sql/production_task_progress_partial_updates.sql`.

---

## 2026-07-03 18:16 -03:00 - ChatGPT Codex

- Objetivo: Cerrar la publicacion del fix del Bridge y confirmar que web/release quedaron disponibles sin intervencion manual.
- Cambios: Se pusheo `main` con commit `51fbf61` (`Fix bridge printing and release flow`) y se creo/pusheo el tag `bridge-v1.6.3`. GitHub Actions creo el release del Bridge y dejo disponible `Inkora.PrintBridge.zip`.
- Verificacion: Release GitHub `bridge-v1.6.3` responde `200`; asset `Inkora.PrintBridge.zip` responde `200` con tamano aproximado 74.5 MB. Vercel muestra produccion `Ready` en `https://inkora-next-1ae23h7gm-inkorashop-7809s-projects.vercel.app`, con aliases `https://inkora.com.ar`, `https://www.inkora.com.ar` y `https://inkora-next.vercel.app`. `vercel logs --since 1h --level error` no encontro logs.
- Auditoria: Se confirmo que los cambios publicados corresponden al commit de Bridge/web/workflow y que los archivos ajenos `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf` siguen fuera de scope.
- Pendiente/Riesgos: Hacer una prueba real desde una PC con Epson usando 7 copias para confirmar que Sumatra recibe una sola orden con `7x`; si una instalacion antigua no trae Sumatra, actualizar desde la web o reinstalar con el ZIP nuevo.

---

## 2026-07-03 18:13 -03:00 - ChatGPT Codex

- Objetivo: Subir lo necesario y hacer el maximo posible para publicar Bridge/web sin intervencion manual.
- Cambios: Se agrego `.github/workflows/release-bridge.yml` para que GitHub Actions cree automaticamente el release `bridge-v*` con el ZIP del Bridge al empujar un tag. Se preparo la publicacion de los cambios documentales, Bridge `1.6.3`, web apuntando a `bridge-v1.6.3` y workflow de release.
- Verificacion: `CI=true npm.cmd run build` OK con warnings preexistentes; `C:\Program Files\dotnet\dotnet.exe build bridge\Inkora.PrintBridge\Inkora.PrintBridge.csproj` OK tras permitir restore NuGet; `git diff --check` OK. `gh` existe pero no esta autenticado, por eso se uso workflow con `GITHUB_TOKEN` de Actions.
- Auditoria: Se reviso la entrada anterior y se confirmo que el ZIP local ya contenia `Inkora.PrintBridge.exe` y `SumatraPDF.exe`. Se mantuvieron fuera de scope `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz y `Messi 2.3mf`.
- Pendiente/Riesgos: Luego del push/tag hay que verificar que GitHub Actions haya creado el release y que Vercel haya desplegado `main`; si el workflow falla, revisar permisos de Actions o descarga de SumatraPDF.

---

## 2026-07-03 18:06 -03:00 - ChatGPT Codex

- Objetivo: Corregir el flujo de impresion para respetar copias desde la web, mejorar el Bridge/instalador y preparar una nueva version actualizable.
- Cambios: Se subio el Bridge a `1.6.3`; `PrintJobService` ahora usa Sumatra con `-print-settings Nx` y DEVMODE para dar prioridad a las copias pedidas, y ya no envia multiples trabajos `shell-printto` cuando faltan copias multiples. `build-release.ps1` ahora incluye `SumatraPDF.exe` en el ZIP. El auto-update del Bridge extrae/copia el paquete completo, muestra estados en el panel local y reinicia con `--updated`. Se mejoro el estilo WinForms del Bridge y se rehizo `install.ps1` con pasos claros. La web apunta a `bridge-v1.6.3` y advierte si falta Sumatra.
- Verificacion: `C:\Program Files\dotnet\dotnet.exe build bridge\Inkora.PrintBridge\Inkora.PrintBridge.csproj` OK; `powershell -NoProfile -ExecutionPolicy Bypass -File bridge\build-release.ps1` OK y genero `bridge\Inkora.PrintBridge\bin\Inkora.PrintBridge.zip` con `Inkora.PrintBridge.exe` y `SumatraPDF.exe`; `CI=true npm.cmd run build` OK con warnings preexistentes; `git diff --check` OK.
- Auditoria: Se siguio el protocolo de `AGENTS.md`, se reviso la ultima entrada y se confirmo que los cambios previos de documentacion seguian sin commitear. No se tocaron `.claude/settings*.json`, `Inkora.PrintBridge.zip` raiz ni `Messi 2.3mf`.
- Pendiente/Riesgos: Para que el boton web "Actualizar" funcione en produccion hay que publicar manualmente el release GitHub `bridge-v1.6.3` con `bridge\Inkora.PrintBridge\bin\Inkora.PrintBridge.zip` y luego desplegar la web. No se pudo crear el release porque `gh` no esta instalado y las herramientas GitHub disponibles no exponen releases.

---

## 2026-07-03 17:22 -03:00 - ChatGPT Codex

- Objetivo: Cambiar la practica del proyecto para que `AGENTS.md` sea el archivo de entrada unico para IAs.
- Cambios: Se actualizo `AGENTS.md` como puerta de entrada unica y protocolo principal. Se ajustaron `CONTEXT.md`, `CLAUDE.md` y `AI_RUN_LOG.md` para apuntar a `AGENTS.md` en lugar de `CONTEXT.md`.
- Verificacion: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md`, `CLAUDE.md` y se reviso `git status --short`. No se corrio build porque solo se modifico documentacion.
- Auditoria: Se reviso la entrada anterior de `AI_RUN_LOG.md`; ahora queda reemplazada la recomendacion anterior de leer `CONTEXT.md` por la nueva recomendacion de leer `AGENTS.md`.
- Pendiente/Riesgos: El prompt corto recomendado desde ahora es: `Lee AGENTS.md y segui el protocolo del proyecto. Tarea: ...`

---

## 2026-07-03 17:20 -03:00 - ChatGPT Codex

- Objetivo: Simplificar el arranque para que el usuario solo tenga que pedirle a la IA leer un archivo.
- Cambios: Se actualizo `CONTEXT.md` como archivo de entrada unico. Se ajustaron `AGENTS.md`, `CLAUDE.md` y `AI_RUN_LOG.md` para redirigir al mismo flujo: leer `CONTEXT.md`, leer `AGENTS.md`, revisar `AI_RUN_LOG.md`, auditar `git status --short` y actualizar la bitacora al cerrar.
- Verificacion: Se leyeron los archivos de protocolo antes de editar y se reviso `git status --short`. No se corrio build porque solo se modifico documentacion.
- Auditoria: Se contrasto la entrada anterior de `AI_RUN_LOG.md` con el estado actual; los archivos de protocolo siguen sin commitear y `CONTEXT.md` continua modificado.
- Pendiente/Riesgos: En nuevos turnos, el prompt corto recomendado es: `Lee CONTEXT.md y segui el protocolo del proyecto. Tarea: ...`

---

## 2026-07-03 17:11 -03:00 - ChatGPT Codex

- Objetivo: Mostrar con un ejemplo real como se actualiza la bitacora para que la proxima IA pueda retomar.
- Cambios: Se agrego esta entrada en `AI_RUN_LOG.md` siguiendo el formato definido en `AGENTS.md`.
- Verificacion: Se leyeron `AGENTS.md`, `CONTEXT.md` y `AI_RUN_LOG.md`; tambien se reviso `git status --short`. No se corrio build porque solo se edito documentacion.
- Auditoria: Se reviso la entrada anterior de ChatGPT Codex y se contrasto con el estado del repo; los archivos `AGENTS.md`, `CLAUDE.md` y `AI_RUN_LOG.md` siguen sin commitear, y `CONTEXT.md` continua modificado.
- Pendiente/Riesgos: Mantener esta practica al cierre de cada turno de trabajo para que Codex y Claude puedan auditarse entre si.

---

## 2026-07-03 17:07 -03:00 - ChatGPT Codex

- Objetivo: Crear un flujo ordenado para que ChatGPT Codex y Claude Code puedan alternar trabajo en el proyecto.
- Cambios: Se agregaron `AGENTS.md`, `CLAUDE.md` y `AI_RUN_LOG.md`. Se preparo una referencia desde `CONTEXT.md` hacia el nuevo protocolo.
- Verificacion: Se reviso `git status --short` y el diff existente de `CONTEXT.md` antes de editar. No se corrio build porque solo se modifico documentacion.
- Auditoria: Se confirmo que no existian `AGENTS.md` ni `CLAUDE.md`, y que `CONTEXT.md` ya tenia cambios previos sobre deploy manual que se conservaron.
- Pendiente/Riesgos: Cada IA debe actualizar esta bitacora al cerrar su turno de trabajo para que el flujo funcione.
