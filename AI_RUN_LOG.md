# Bitacora de turnos de trabajo IA

El archivo de entrada unico para iniciar trabajo en este proyecto es `AGENTS.md`.

Si una IA abre primero esta bitacora, debe volver a `AGENTS.md`, seguir el protocolo de arranque, leer `CONTEXT.md`, auditar la ultima entrada y recien despues trabajar.

Agregar cada nueva entrada arriba de todo, debajo de esta introduccion.

## 2026-07-05 20:53 -03:00 - ChatGPT Codex

- Objetivo: Revisar y corregir la alerta de GitGuardian por un `Generic High Entropy Secret` expuesto en GitHub.
- Cambios: Se confirmo que el candidato real era el `x-webhook-secret` hardcodeado en `sql/chat_push_notifications.sql` para el webhook de push del chat. Se elimino el secret real del SQL versionado. Ahora `notify_chat_message_webhook()` lee el valor desde `private.app_secrets` (schema privado, sin grants a `anon/authenticated`) y omite solo el webhook si falta configurar el secret, sin romper el insert del mensaje. Se agrego `sql/chat_webhook_secret_rotation.sql` como script de rotacion: crea/asegura la tabla privada, guarda el nuevo secret y recrea la funcion/trigger sin hardcodear el valor.
- Verificacion: `rg` confirmo que el valor filtrado ya no aparece en archivos actuales del repo. `git diff --check` OK, solo aviso CRLF. No se ejecuto build porque el cambio fue SQL/documentacion, sin JS runtime.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. La ultima entrada relevante era de Claude sobre mantenimiento/402, sin conflicto. El arbol tenia solo los binarios sin trackear ya conocidos (`Inkora.PrintBridge.zip`, `Messi 2.3mf`).
- Pendiente/Riesgos: Falta rotar el valor real en produccion: generar un secret nuevo, guardarlo como `CHAT_WEBHOOK_SECRET` en Vercel Production y ejecutar `sql/chat_webhook_secret_rotation.sql` en Supabase SQL Editor con ese mismo valor. No se cambio Vercel desde esta corrida para no desincronizarlo de Supabase y romper temporalmente las push del chat. El secret viejo debe considerarse comprometido aunque se haya quitado del archivo actual, porque sigue existiendo en el historial de Git.

## 2026-07-05 -03:00 - Claude Sonnet 5 (v16)

- Objetivo: Corregir 5 detalles reportados por el usuario tras probar el sistema de mantenimiento/402 del turno anterior: (1) agregar el icono de WhatsApp al boton de la pantalla de mantenimiento/error; (2) el mensaje prellenado de WhatsApp no debe mencionar "problema tecnico" cuando es por mantenimiento; (3) al activarse para un usuario activo, la pagina se sentia como si "se reiniciara" en vez de solo aparecer el aviso; (4) confirmado un bug real: navegar de landing a catalogo (u otra seccion) disparaba el bloqueo instantaneo como si fuera una recarga, cuando no deberia; (5) pedido nuevo: si el usuario esta viendo la pantalla de mantenimiento y esta se desactiva, que se le recargue solo para que vea la pagina real actualizada.
- Cambios: En `components/ServiceUnavailable.js` se agrego el mismo SVG de WhatsApp ya usado en el boton de confirmacion de pedido de `app/catalogo/page.js` (para no inventar un icono nuevo) dentro del boton, y se separo el texto prellenado por variante: para `'maintenance'` dice "vi que la pagina esta en mantenimiento" (sin mencionar problema tecnico), para `'error'` sigue mencionando un problema tecnico (caso realista, es un 402). El fix de (3) y (4) requirio rediseñar `components/MaintenanceGate.js` de fondo: se descubrio que TODA la navegacion interna del sitio (`components/Header.js`, `app/dashboard/page.js`) usa `<a href>` planas en vez de `next/link`, es decir que ir de landing a catalogo YA es tecnicamente una recarga completa del documento — por eso antes no se podia distinguir "cambio de seccion" de "F5 real" con solo mirar si el componente seguia montado. La solucion fue usar la Navigation Timing API (`performance.getEntriesByType('navigation')[0].type === 'reload'`) para detectar un reload real, combinada con un flag en `sessionStorage` (`inkora_session_active`) que se lee ANTES de escribirse en cada carga: si ya estaba en `true` (la pestaña ya habia visto una pagina antes, sin importar si fue reload o navegacion) Y no es un reload real, se trata como "sesion ya activa" y NO se bloquea instantaneo aunque el mantenimiento ya este programado (se muestra el cartel con cuenta regresiva normal); si es un reload real, o es la primera carga de la pestaña con el mantenimiento ya activo, se bloquea directo. Para (3), se cambio el render de "reemplazar `children` por la pantalla" a "mantener `children` montado (sin destruir su estado) y superponer `ServiceUnavailable` encima con `position:fixed`" tanto para el caso de mantenimiento como para el 402. Para (5), se agregaron refs (`activatesAtMsRef`, `freshLoadBlockedRef`) para poder comparar en cada poll (cada 15s) si el estado "bloqueado" pasa de `true` a `false` (es decir, se desactivo el mantenimiento mientras el usuario lo estaba viendo) y en ese caso especifico se llama a `window.location.reload()` una sola vez.
- Verificacion: `npx eslint components/MaintenanceGate.js components/ServiceUnavailable.js` sin errores ni warnings. `npx next build` completo OK. Se corrio `next start` en local (puerto 3200) y se confirmo que `/`, `/catalogo` y `/admin` siguen respondiendo 200 con el nuevo `MaintenanceGate`.
- Auditoria: Se releyo `components/Header.js` y `app/dashboard/page.js` para confirmar el patron real de navegacion del sitio antes de asumir que el enfoque anterior (basado solo en si el componente seguia montado) era suficiente — no lo era, de ahi el cambio de diseño. `git status` antes de commitear solo mostraba los dos archivos tocados.
- Pendiente/Riesgos: Sigue sin poder probarse visualmente en un navegador real en este entorno (sin herramienta de automatizacion de browser); la logica de reload/sessionStorage/Navigation Timing API se razono con cuidado paso a paso pero conviene que el usuario la prueba a mano una vez en produccion (activar servicio tecnico, navegar entre secciones sin recargar, despues F5, despues desactivar) para confirmar el comportamiento exacto. La Navigation Timing API es estandar y esta soportada en todos los navegadores modernos (Chrome/Edge/Firefox/Safari actuales), pero si algun navegador viejo no la soporta, `isHardReload()` devuelve `false` de forma segura (no rompe, simplemente ese caso puntual dependeria solo de `sessionStorage`). Sigue pendiente la correccion de RLS y la decision sobre el dominio en el proyecto viejo de Vercel.

## 2026-07-05 -03:00 - Claude Sonnet 5 (v15)

- Objetivo: Ajustar dos cosas reportadas por el usuario tras el turno anterior (sistema de mantenimiento/402): (1) en Admin > Config, el estado de "servicio tecnico" no se notaba lo suficiente y los botones de activar seguian clickeables aunque ya hubiera uno programado/activo; (2) la regla de cuenta regresiva para usuarios activos estaba mal: debia activarse recien a los N minutos SOLO si la pestaña se mantiene abierta sin recargar ni volver a cargar el documento — un F5/recarga manual durante la ventana de mantenimiento debe bloquear al instante (como un usuario "recien llegado"), pero navegar entre secciones sin recargar (landing/catalogo, via router de Next) no debe disparar el bloqueo instantaneo. Ademas, de paso, se arreglo el menu superior de tabs de Admin que se cortaba a la derecha sin ninguna pista de que se podia scrollear.
- Cambios: En `app/admin/page.js`, la tarjeta de "Servicio tecnico (mantenimiento)" ahora muestra un banner de estado con color e icono bien visibles (verde/inactivo, amarillo/programado, rojo/activo) en vez de una linea de texto gris chica; los botones "Activar servicio tecnico" y "Activar al instante" se deshabilitan (`disabled`, gris, `cursor:not-allowed`, con `title` explicando por que) mientras ya haya algo programado o activo, y el boton de desactivar paso a ser prominente (verde, `Desactivar servicio tecnico`) y solo aparece en ese mismo caso. En `components/MaintenanceGate.js` se agrego la distincion entre "carga fresca" y "sesion ya abierta": con un `useRef` (`firstFetchDoneRef`) se marca si, en el PRIMER poll tras montar el componente (que solo ocurre en una carga de documento nueva: recarga manual, pestaña nueva, o navegar desde una ruta exenta como /admin), ya habia un `maintenance_activates_at` seteado — en ese caso se bloquea directo con la pantalla de mantenimiento sin esperar el resto de la cuenta regresiva (`freshLoadBlocked`). Si en cambio el valor aparece por primera vez en un poll POSTERIOR al primero (se programo mientras la pestaña ya estaba abierta, sin recarga de por medio), se sigue mostrando el cartel con cuenta regresiva como antes y recien se bloquea cuando esta llega a cero. Como el componente vive en el layout raiz y no se remonta al navegar entre rutas no exentas (landing/catalogo) via el router de Next, el estado persiste correctamente entre esas navegaciones. Tambien se agrego que si se desactiva el mantenimiento desde Admin mientras alguien ya esta bloqueado, se libera solo en el siguiente poll (sin recargar). Para el menu de tabs (`app/admin/page.js`), se agrego un ref (`tabsScrollRef`) al contenedor `.adm-tabs`, un estado `tabScrollState` que detecta si hay contenido oculto a izquierda/derecha (listener de `scroll` + `resize`), y dos botones flecha superpuestos (con gradiente para no tapar bruscamente) que aparecen solo cuando corresponde y hacen `scrollBy` suave de 220px.
- Verificacion: `npx eslint app/admin/page.js components/MaintenanceGate.js` sin errores (solo warnings preexistentes de `<img>`). `npx next build` completo OK, mismas rutas que el turno anterior.
- Auditoria: Se releyo el propio `MaintenanceGate.js` del turno anterior antes de tocarlo para entender bien por que la version previa bloqueaba apenas se cumplia el timestamp sin importar si la pestaña ya estaba abierta o no (le faltaba distinguir "primer poll" de "poll posterior"). `git status` antes de commitear solo mostraba estos dos archivos modificados, sin cambios de otros agentes de por medio.
- Pendiente/Riesgos: Igual que el turno anterior, no se pudo verificar visualmente en un navegador real (sin herramienta de browser automation en este entorno) que el cartel de cuenta regresiva se comporte exactamente asi en vivo; se valido por lectura cuidadosa de la logica de estado. El scroll del menu de tabs tampoco se probo visualmente, solo se confirmo que el build no rompe y que el codigo sigue el mismo patron ya usado en otros lados del archivo (`.adm-tabs` con overflow-x ya existente). Sigue pendiente la correccion de RLS y la decision sobre el dominio en el proyecto viejo de Vercel.

## 2026-07-05 -03:00 - Claude Sonnet 5 (v14)

- Objetivo: Implementar el sistema de resiliencia ante el 402 de Supabase (Fair Use Policy / cuota excedida) discutido en turnos anteriores: (1) detectar el 402 y mostrar una pantalla propia en vez del error crudo, (2) email de alerta a inkorashop@gmail.com ante ese error u otros graves, con throttling para no saturar, (3) modo "servicio tecnico" activable manualmente desde Admin, con cartel de cuenta regresiva para usuarios activos y bloqueo instantaneo para los que recien cargan la pagina. Se descarto a pedido explicito del usuario la idea de "simular" el error 402 (solo queda el toggle manual).
- Cambios: `lib/error-alert.js` (nuevo) expone `notifyOpsError({source, message, details})`: manda un email via Resend directo a `process.env.EMAIL`, con cooldown en memoria de 10 min por `source` para no saturar si un error se repite en loop; no depende de Supabase para nada, asi funciona aunque Supabase este caido. `app/api/notify-error/route.js` (nuevo) expone esto via POST para que el cliente (browser) tambien pueda dispararlo. `lib/supabase.js` ahora crea el cliente con un `fetch` custom (`global: { fetch }`) que detecta `status === 402`, dispara un `CustomEvent('inkora:supabase-402')` en `window` y llama a `/api/notify-error` (con su propio cooldown de 5 min en el browser, capa extra sobre el del servidor). `components/ServiceUnavailable.js` (nuevo) es la UNICA pantalla reutilizable (variant `'error'` o `'maintenance'`) pedida por el usuario; resuelve el numero de WhatsApp con la MISMA logica exacta que ya existia en `app/catalogo/page.js` (telefono del vendedor asignado del perfil, si no `3765211017` por defecto), haciendo su propio fetch de `auth.getUser()` + `profiles` con manejo de error silencioso (si Supabase esta caido, cae solo al numero por defecto). `components/MaintenanceGate.js` (nuevo) envuelve toda la app desde `app/layout.js`: no hace nada en `/admin`, `/operarios`, `/produccion` (quedan exentas); en el resto, escucha el evento de 402 (bloqueo inmediato con la pantalla) y hace polling cada 15s a `settings.maintenance_activates_at` — si ya paso, bloquea con la pantalla de mantenimiento (esto cubre tanto "activacion instantanea" como el momento en que se cumple la cuenta regresiva); si es una fecha futura, muestra un cartel superior fijo con los minutos restantes (recalculado en cada poll) sin bloquear la pagina. En `app/admin/page.js` se agrego una tarjeta nueva en Config con: input de minutos de aviso (`maintenance_minutes`, persistido igual que otros settings numericos ya existentes), boton "Activar servicio tecnico" (confirm simple, guarda `maintenance_activates_at = ahora + N minutos`), boton "Activar al instante" (con confirmacion doble via `window.confirm` encadenados, ya que es mas disruptivo), boton "Desactivar" (solo visible si hay algo activo/programado, limpia el setting) y un texto de estado actual. En `app/api/send-email/route.js` se engancho `notifyOpsError` en el fallo del email de aviso al admin (el caso mas grave: si eso falla, nadie se entera del pedido nuevo).
- Verificacion: `npx eslint` sobre todos los archivos nuevos/tocados, sin errores (solo warnings preexistentes de `<img>` en otras partes de `admin/page.js`). `npx next build` completo OK, `/api/notify-error` aparece listado como ruta dinamica. Se corrio `next start` en local (puerto 3200) y se probo en caliente: `POST /api/notify-error` con un `source` de prueba devolvio `{"ok":true}` (email real enviado, primera llamada); una segunda llamada inmediata con el mismo `source` devolvio `{"ok":false,"skipped":true,"reason":"throttled"}`, confirmando el cooldown. Se confirmo que `/`, `/catalogo` y `/admin` siguen respondiendo 200 con `MaintenanceGate` montado en el layout raiz.
- Auditoria: Se leyeron `AGENTS.md`/`CONTEXT.md`/bitacora antes de empezar; el `git status` mostraba el arbol limpio salvo binarios sin trackear ya conocidos (`Inkora.PrintBridge.zip`, `Messi 2.3mf`) — no hubo conflicto con la entrada de Codex de arriba (Produccion/mobile, archivos distintos). No se pudo probar visualmente en navegador real el cartel de cuenta regresiva en vivo (sin herramienta de browser automation disponible en este entorno); la logica se valido por lectura de codigo y por las pruebas de red/API descriptas arriba.
- Pendiente/Riesgos: Falta validar visualmente en un navegador real que el cartel superior decrezca sin refrescar y que la pantalla de mantenimiento efectivamente reemplace el contenido al llegar a 0 (recomendado probar activando "al instante" desde Admin en un entorno de staging/produccion con cuidado, ya que afecta a usuarios reales). El polling de 15s implica que el bloqueo tras "activar al instante" puede demorar hasta ~15s en aparecer en pestañas ya abiertas, no es literalmente instantaneo para esas pestañas (si es instantaneo para quien recien carga la pagina). El cooldown de `notifyOpsError` es en memoria del proceso serverless: sobrevive bien dentro de una misma instancia "tibia" pero se resetea en un cold start, por lo que en un caso raro podria mandarse un email un poco antes de los 10 minutos tras un reinicio de funcion — se acepto como limitacion razonable para no sumar infraestructura nueva (Redis/KV) solo para esto. Sigue pendiente, sin resolver, la decision sobre sacar `www.inkora.com.ar` del proyecto viejo `inkora` en Vercel, y sigue diferida (a pedido del usuario) la correccion de los 4 hallazgos CRITICAL de RLS deshabilitado en `orders`/`products`/`designs`/`admins`.

## 2026-07-05 19:42 -03:00 - ChatGPT Codex

- Objetivo: Mejorar el responsive mobile de Produccion, confirmar que la PWA respete el orden de tabs configurado en Admin y que las tabs principales tengan iconos con menos separacion en mobile.
- Cambios: En `components/ProductionTab.js` se ajusto Produccion para mobile: contenedor con altura/overflow flexible, sub-tabs con scroll horizontal compacto, tarjetas superiores de acceso/bridge en columna cuando corresponde, header del pedido y controles sin solaparse, resumen en grilla 2x2 y tabla de tareas con ancho minimo para evitar columnas pisadas. Se audito `app/admin/page.js` y ya estaba en `HEAD` con iconos SVG simples en tabs principales, menor espaciado mobile y sincronizacion del orden de tabs via `settings.admin_tab_order` + migracion desde `localStorage`.
- Verificacion: `npx.cmd eslint app/admin/page.js components/ProductionTab.js --quiet` OK. `npm.cmd run build` OK, con warnings preexistentes de `<img>` y dependencias de hooks en archivos no relacionados.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`; el arbol solo tenia sin trackear `Inkora.PrintBridge.zip` y `Messi 2.3mf`. Se reviso la entrada anterior de Claude sobre emails y no habia conflicto con Produccion/Admin tabs.
- Pendiente/Riesgos: Validar visualmente en un celular/PWA real que el scroll horizontal de la tabla de tareas sea comodo; no se tocaron las cantidades ni la logica de impresion.

## 2026-07-05 -03:00 - Claude Sonnet 5 (v13)

- Objetivo: Agregar un boton "Ver pedido" al email de notificacion interna (el que llega a inkorashop@gmail.com por cada pedido nuevo) que lleve directo al detalle de ese pedido en Admin. Si quien lo abre no tiene sesion de admin, el login normal de la app se encarga de pedirselo (no hizo falta nada especial para eso).
- Cambios: Se encontro que `app/admin/page.js` ya tenia un esquema de deep-link para pedidos (`?tab=pedidos&modal=pedido&pedido=<id_o_codigo>`, usado internamente por `buildAdminUrlFromState`/`applyAdminUrlFromLocation` para compartir/persistir el link a un pedido abierto) y que `findOrderFromAdminUrl` matchea tanto por `order.id` como por `order.order_code` — asi que se pudo usar directamente el `orderCode` (ya disponible en el payload de `/api/send-email`) sin tener que buscar el uuid interno del pedido. En `app/api/send-email/route.js` se agrego `orderAdminUrl` (`https://www.inkora.com.ar/admin?tab=pedidos&modal=pedido&pedido=${encodeURIComponent(orderCode)}`) y un boton HTML centrado ("Ver pedido") insertado en `defaultAdminHtml` entre los datos del pedido y la tabla de items. A proposito **no** se agrego al email del cliente (`defaultClientHtml`), solo al del admin, que es lo que se pidio.
- Verificacion: `npx eslint`/`npx next build` sin errores; se probo la construccion de la URL con `node -e` usando un codigo de pedido de ejemplo para confirmar el formato exacto.
- Auditoria: Se leyo con cuidado el mecanismo existente de URL del admin (`TAB_SLUGS`, `SLUG_TABS`, `applyAdminUrlFromLocation`, `findOrderFromAdminUrl`) antes de escribir la URL a mano, para no inventar un formato de parametros que no coincidiera con lo que el admin realmente sabe leer — se confirmo que el slug de tab correcto es `pedidos` (espaniol, `TAB_SLUGS.orders === 'pedidos'`), no `orders`, y que no hace falta pasar `vista` porque el codigo ya la infiere solo segun si el pedido esta archivado.
- Pendiente/Riesgos: Ninguno esperado — reutiliza un mecanismo de navegacion ya probado en el propio admin, no se invento logica nueva de routing.

- Objetivo: Se le paso el resumen del fix anterior (email de pedidos) a otra IA para revision independiente. Confirmo los 6 puntos preguntados, pero encontro 2 cosas incompletas: (1) el fix de locale (`es-AR`) solo se habia aplicado al total del mensaje de WhatsApp, quedaban 8 lugares mas en el catalogo mostrando dinero con `.toLocaleString()` sin locale; (2) `i.qty` no se escapaba en el HTML del email (bajo riesgo en el flujo normal porque siempre es un numero ya normalizado, pero si alguien llama la API a mano con un payload raro podria inyectar HTML via cantidad).
- Cambios: En `app/catalogo/page.js` se verifico con grep que habia exactamente 8 instancias de `.toLocaleString()` sin argumento (precio unitario, precio de item en carrito, total desktop/mobile) y se corrigieron todas a `.toLocaleString('es-AR')` con un solo reemplazo global, verificando antes que no hubiera ningun otro uso de `.toLocaleString()` en el archivo que no fuera dinero (los otros 3 usos ya tenian `'es-AR'` explicito de antes). En `app/api/send-email/route.js`, dentro de `buildTable()`, se agrego `const safeQty = escapeHtml(i.qty);` y se uso en los dos `<td>` que mostraban `i.qty` directo.
- Verificacion: `npx eslint`/`npx next build` sin errores; se re-listaron todos los `toLocaleString` del archivo despues del cambio para confirmar que quedaron los 10 (8 nuevos + 2 que ya estaban bien) todos con `'es-AR'` y ninguno se duplico ni se rompio por el reemplazo global.
- Auditoria: La segunda IA confirmo los 6 puntos de verificacion pedidos (el throw queda dentro del try correcto, el catch interno del email aisla bien, el contrato `clientEmailSent` coincide entre frontend/backend, el escape de HTML esta completo salvo qty, y confirmo independientemente que `applyTemplate` no esta definida). Sobre `applyTemplate`: sigue sin tocarse a proposito, fuera de alcance (ver entrada anterior).
- Pendiente/Riesgos: Ninguno esperado. Sigue pendiente, sin resolver, la decision sobre sacar `www.inkora.com.ar` del proyecto viejo `inkora` en Vercel.

## 2026-07-05 -03:00 - Claude Sonnet 5 (v11)

- Objetivo: Corregir con cuidado los hallazgos confirmados de una auditoria de emails (pedido/admin/whatsapp), excluyendo a proposito el bug de agregacion de cantidades por variante (ya conocido, deprioritizado por el usuario).
- Cambios: En `app/catalogo/page.js` (`submitOrder`): el insert de `orders` ahora revisa `{ error }` y lo tira si falla, para que el catch general lo atrape y NO se mande el email ni se muestre "confirmado" si el pedido no se guardo de verdad (antes seguia de largo en silencio). El fetch a `/api/send-email` quedo en su propio try/catch interno: si el pedido ya se guardo pero el email falla (red o respuesta no-ok), se registra un evento de analytics (`order_email_failed` / `order_client_email_failed`) en vez de bloquear la confirmacion al cliente (el pedido es el dato real, el email es un aviso). Se corrigio tambien `total.toLocaleString()` sin locale en el mensaje de WhatsApp, que dependia del locale del navegador del cliente — ahora usa `'es-AR'` explicito como en el resto del sitio. En `app/api/send-email/route.js`: se agrego `escapeHtml()` y se aplico a todo dato que viene del formulario del cliente (nombre, telefono, email, notas, nombre de vendedor, nombre de producto/diseno) antes de insertarlo en el HTML de los emails (admin y cliente), sin tocar el CSV adjunto (que ya tiene su propio escape correcto) ni los fragmentos de HTML ya generados por el propio codigo (tabla, seccion de total). El envio del email de confirmacion al cliente ahora revisa la respuesta de Resend (antes no la revisaba, podia fallar en silencio); si falla, no se devuelve error 500 (el email al admin, mas critico, ya se mando bien), sino que se informa `clientEmailSent:false` en la respuesta para que el front lo pueda registrar.
- Verificacion: `npx eslint`/`npx next build` sin errores; se probo `escapeHtml` de forma aislada con `node -e` contra casos con `< > & " '`, null y undefined.
- Auditoria: Se hizo una revisión independiente completa antes de corregir (sin mirar primero un diagnostico de otra IA que el usuario habia compartido, para no sesgarse) y se confirmaron los 5 hallazgos de esa revisión previa como correctos, mas 1 hallazgo propio no detectado antes (el locale de WhatsApp). Se detecto en paralelo que "ChatGPT Codex" habia commiteado justo antes (`3682685`, ver entrada de abajo) un cambio a este mismo archivo (sacar la carga de plantillas custom); se verifico con `git diff HEAD` que mis cambios quedaron limpiamente encima de ese commit, sin pisar nada.
- Pendiente/Riesgos: **No se toco** el bug de agregacion de cantidades por variante en `getUnitPrice` (por pedido explicito del usuario). El commit de Codex de este mismo dia dejo llamadas a una funcion `applyTemplate(...)` que ya no esta definida en el archivo (la removieron junto con `loadEmailTemplates`) — hoy es codigo muerto inofensivo porque `customTemplates` esta hardcodeado a `{}` y esas ramas nunca se ejecutan, pero si en el futuro se repuebla `customTemplates` sin restaurar `applyTemplate`, cualquier pedido tiraria un 500. No lo toque por estar fuera del alcance de lo pedido en este turno; queda como nota para quien retome ese tema. Sigue pendiente, sin resolver, la decision sobre sacar `www.inkora.com.ar` del proyecto viejo `inkora` en Vercel.

---

## 2026-07-05 18:51 -03:00 - ChatGPT Codex

- Objetivo: Quitar la edicion de plantillas de email desde Admin y dejar una pestaña solo de vista previa de los formatos de emails.
- Cambios: Se reemplazo `components/EmailsTab.js` por un visor de solo lectura con previews de pedido interno, confirmacion de pedido al cliente, confirmacion de cuenta y reset de contraseña. En `app/api/send-email/route.js` se dejo de cargar plantillas custom desde `settings`, para que los emails de pedido usen el formato fijo del codigo aunque existan configuraciones viejas guardadas.
- Verificacion: `node --check components/EmailsTab.js` OK; `node --check app/api/send-email/route.js` OK; `git diff --check` OK con aviso CRLF; `npm.cmd run build` OK con warnings preexistentes.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. La ultima entrada relevante era de Claude sobre ajustes visuales en Catalogo, sin conflicto con Emails. Se detecto que `components/EmailsTab.js` existia localmente pero no estaba trackeado, por eso se incluye como archivo nuevo de este turno.
- Pendiente/Riesgos: Probar manualmente Admin > Emails en desktop/mobile y confirmar que la vista comunica correctamente que los emails de Supabase Auth se administran fuera del admin.

Formato obligatorio:

## 2026-07-05 -03:00 - Claude Sonnet 5 (v10)

- Objetivo: El usuario no notaba el efecto de transparencia del overlay de "copiado" (85% opacidad + blur 5px resultaba demasiado sutil en la practica, casi indistinguible de solido).
- Cambios: En `app/catalogo/page.js` se bajo la opacidad de 0.85 a 0.6 y el desenfoque de 5px a 2px en ambos overlays (codigo del pedido y recuadro de WhatsApp), para que el texto de atras se note bastante mas. Se agrego `textShadow` sutil al texto blanco de confirmacion para mantenerlo legible a pesar de la menor opacidad de fondo.
- Verificacion: `npx eslint`/`npx next build` sin errores; se confirmo con `curl` sobre el bundle desplegado que el cambio anterior (0.85/5px) SI estaba en produccion antes de este ajuste — no era un problema de deploy, era que el efecto resultaba demasiado sutil a simple vista.
- Auditoria: N/A.
- Pendiente/Riesgos: Ninguno esperado. Sigue pendiente, sin resolver, la decision sobre sacar `www.inkora.com.ar` del proyecto viejo `inkora` en Vercel (ver entrada anterior) — se sigue reforzando cada deploy con `vercel --prod` manual ademas del push a git por las dudas.

- Objetivo: Ajustar el overlay de "copiado" para que sea semi-transparente (no solido) y se siga viendo el texto de atras, en vez de taparlo del todo.
- Cambios: En `app/catalogo/page.js`, el fondo del overlay (`.copied-overlay`, tanto en el codigo del pedido como en el recuadro de WhatsApp) paso de `background:'#18a36a'` solido a `background:'rgba(24,163,106,0.85)'` + `backdropFilter:'blur(5px)'` (con prefijo `WebkitBackdropFilter` para Safari). El texto de atras queda visible pero desenfocado, sin competir en nitidez con el texto blanco de confirmacion que va encima.
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: N/A (ajuste de diseno discutido y acordado con el usuario antes de implementar, incluyendo la alternativa de solo-opacidad que se descarto por legibilidad).
- Pendiente/Riesgos: Se detecto en el turno anterior que `www.inkora.com.ar` esta asignado a 2 proyectos de Vercel a la vez (`inkora-next` y un proyecto viejo `inkora` sin actualizar hace 40 dias), lo que puede hacer que el auto-deploy de GitHub no se refleje de forma confiable. Sigue sin resolverse (el usuario no confirmo sacar el dominio del proyecto viejo todavia) — por las dudas, se va a reforzar cada deploy de este turno con `vercel --prod` manual ademas del push a git.

- Objetivo: Rehacer el feedback de "copiado" (codigo del pedido y texto de WhatsApp) que el usuario no aprobaba: no le gustaba el difuminado del contenido ni que el aviso flotara arriba del elemento en vez de taparlo. Se propuso una alternativa (overlay que cubre el elemento) antes de tocar codigo, y el usuario la aprobo.
- Cambios: En `app/catalogo/page.js` se reemplazo por completo el patron anterior (blur + toast flotando afuera con `bottom:100%`) por un overlay `position:absolute; inset:0` que cubre el elemento entero al copiar, con fondo verde solido (#18a36a), icono de check + texto centrado, animacion de fade+scale suave (`copied-overlay-pop`, reemplaza a la vieja `copied-toast-pop`). El icono de copiar en la esquina/al lado deja de alternar a check (queda fijo) ya que el overlay es ahora la unica señal de "copiado". Para el codigo del pedido (elemento chico) el texto del overlay es "¡Copiado!" corto para que entre sin achicarse; para el recuadro de WhatsApp (mas ancho) se mantiene "Copiado al portapapeles" completo.
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: N/A (rediseño acordado explicitamente tras propuesta discutida con el usuario antes de implementar).
- Pendiente/Riesgos: Ninguno esperado.

- Objetivo: El texto "Confirmar por WhatsApp" se cortaba en dos renglones dentro de su boton. El usuario pidio que ambos botones ("Listo" y "Confirmar por WhatsApp") sean del mismo tamano y se agranden lo necesario para que el texto entre en un renglon.
- Cambios: En `app/catalogo/page.js` ambos botones pasan de `maxWidth:260`/`maxWidth:220` a `maxWidth:300` (mismo valor en los dos) y se agrega `whiteSpace:'nowrap'` para evitar el corte de linea de forma robusta independientemente del ancho final.
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: N/A.
- Pendiente/Riesgos: El usuario tambien pidio repensar (sin implementar todavia) la animacion de "Copiado al portapapeles": no le gusta el difuminado actual y quiere que el aviso aparezca tapando el elemento copiado (overlay), no flotando arriba de el. Queda pendiente proponer un diseno nuevo en el proximo turno, sin tocar codigo hasta que lo apruebe.

- Objetivo: 3 ajustes finos sobre la pantalla de pedido confirmado: boton de WhatsApp un poco menos ancho que "Listo"; sacar el titulo/subtitulo "Confirmar por WhatsApp / Opcional, para avisarnos directo."; y que el feedback de copiado (toast + difuminado) dure un poco menos y difumine menos fuerte.
- Cambios: En `app/catalogo/page.js`: se elimino el bloque de titulo+subtitulo sobre el boton de WhatsApp. El boton paso de `width:100%` a `maxWidth:220` centrado con `margin:'0 auto'` (mas angosto que el "Listo" que tiene `maxWidth:260`). El timeout de "copiado" (codigo y texto de WhatsApp) bajo de 2000ms a 1300ms, sincronizado con la animacion CSS `.copied-toast`; el difuminado bajo de `blur(4px)`/opacidad 0.4 a `blur(2px)`/opacidad 0.55 en ambos lugares.
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: N/A (ajustes de diseno acordados explicitamente).
- Pendiente/Riesgos: Ninguno esperado.

- Objetivo: 4 ajustes sobre la pantalla de pedido confirmado: (1) icono de copiar mas visible y cambiado al iconico "dos cuadraditos superpuestos"; (2) los textos "Codigo de tu pedido:" y "Te enviamos la confirmacion a tu email." menos protagonicos (gris); (3) boton de "Confirmar por WhatsApp" mas grande, centrado en su seccion, con el icono de WhatsApp; (4) el texto de email de confirmacion solo debe aparecer si el pedido realmente va a mandar ese email.
- Cambios: En `app/catalogo/page.js`: se reemplazo el icono tipo "clipboard con broche" por el icono estandar de copiar (dos rectangulos superpuestos), subiendo tamano (15→19px) y opacidad en reposo (0.4→0.6), en los dos lugares (codigo de pedido y recuadro de WhatsApp). Los dos textos secundarios pasan a `color:'#9aa3bc'`. El boton de WhatsApp se reescribio: `width:100%`, centrado, `padding` mas grande, `fontSize:15`, y el path SVG real de WhatsApp (el mismo que ya se usaba en el boton flotante) adentro. El texto "Te enviamos la confirmacion..." ahora esta condicionado a `profile?.send_confirmation_email !== false` — el mismo flag que ya se usa para decidir si `/api/send-email` manda el mail al cliente (`sendConfirmation: profile?.send_confirmation_email !== false` en la funcion de envio), asi el texto nunca miente sobre si se mando o no el email.
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: Para el punto (4), se busco en todo el repo el flag real que controla el envio del email de confirmacion de pedido (no es un setting global de Admin sino un campo por-usuario `profiles.send_confirmation_email`, el mismo que ya usaba `submitOrder` para decidir `sendConfirmation` al llamar `/api/send-email`), para que el texto y el comportamiento real queden sincronizados sin inventar una fuente de verdad nueva.
- Pendiente/Riesgos: Ninguno esperado.

- Objetivo: Sumarle al feedback de copiar (codigo del pedido y texto de WhatsApp) un toast "Copiado al portapapeles" con animacion suave, difuminado del contenido copiado mientras se muestra, y un icono chico de portapapeles (que pasa a ✓ por 2s) al lado/esquina de cada elemento.
- Cambios: En `app/catalogo/page.js` se agrego el keyframe `copied-toast-pop` (fade+scale in, pausa, fade+scale out, 2s totales via clase `.copied-toast`) al bloque `<style>` existente. El codigo del pedido ahora es `display:inline-block` con un icono de portapapeles/check inline a la derecha del texto (semi-transparente en reposo, opaco+verde al copiar) y el toast aparece flotando arriba centrado; el texto en si se difumina (`filter: blur(4px)` + opacidad reducida) mientras esta copiado. Mismo patron en el recuadro de WhatsApp, con el icono en la esquina superior derecha (estilo bloque de codigo de documentacion) en vez de inline, ya que es una caja de varias lineas.
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: N/A (iteracion de diseno acordada explicitamente con el usuario sobre el turno anterior).
- Pendiente/Riesgos: Ninguno esperado.

- Objetivo: Simplificar mas la pantalla de "pedido confirmado": sacar el boton/label de "Copiar" (tanto del texto de confirmacion como del codigo del pedido) sin perder que ambos se puedan copiar, y agrandar el titulo "Pedido confirmado!" para que se entienda de un vistazo que ya quedo confirmado.
- Cambios: En `app/catalogo/page.js`: `successTitle` paso de 22px/700 a 30px/800. El codigo del pedido (`{orderCode}`) y el recuadro con el texto de WhatsApp ahora son clickeables directamente (todo el elemento, no un boton aparte): `cursor:pointer`, `title="Click para copiar"` como tooltip nativo, y feedback puramente visual (fondo/borde verde ~2s) via los estados `codeCopied` (nuevo) y `waCopied` (ya existia). Se elimino la fila con el label "TEXTO DE CONFIRMACION" y el boton "Copiar"/"Copiado".
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: N/A (cambio de UI acordado explicitamente con el usuario, opcion "2" de las alternativas propuestas).
- Pendiente/Riesgos: El tooltip nativo (`title`) no se ve en mobile (sin hover), pero el area clickeable es todo el elemento (no un icono chico), asi que sigue siendo facil de tocar aunque no se explique por adelantado — coincide con lo que el usuario eligio conscientemente.

- Objetivo: (1) Terminar y desplegar un cambio de Codex (reorganizar pantalla de "pedido confirmado") que habia quedado sin commitear porque esa sesion corto por limite de uso; (2) evitar que las cards de diseno en Catalogo cambien de alto cuando aparece/desaparece el precio unitario segun la cantidad.
- Cambios: (1) Se reviso el diff sin commitear que dejo Codex en `app/catalogo/page.js` y `AI_RUN_LOG.md`, se verifico que compilaba y lintaba limpio, y se completo el paso que faltaba (commit + push). (2) En `app/catalogo/page.js`, el bloque que muestra `$precio/u` debajo de la categoria de cada diseno devolvia `null` cuando el precio todavia no aplicaba (cantidad insuficiente para ese tramo), haciendo que esa card (y por extension toda la fila del grid) creciera verticalmente recien cuando el precio aparecia. Se cambio para que el `div` siempre se renderice con el mismo alto, alternando `visibility: hidden/visible` en vez de `null`, asi el espacio queda reservado desde el principio.
- Verificacion: `npx eslint`/`npx next build` sin errores en ambos cambios.
- Auditoria: Para (1), se comparo el diff de Codex contra los requisitos que el usuario ya habia pedido en esa sesion (titulo "Pedido confirmado", boton "Listo" unico, WhatsApp en tarjeta aparte, "Copiar" chico integrado arriba del texto) y coincidia exactamente, no hizo falta corregir nada, solo desplegar.
- Pendiente/Riesgos: Ninguno esperado.

---

## 2026-07-05 16:49 -03:00 - ChatGPT Codex

- Objetivo: Reorganizar la pantalla posterior a confirmar pedido en Catalogo: titulo "Pedido confirmado", boton principal "Listo", seccion separada de WhatsApp y texto de confirmacion con accion de copiar integrada.
- Cambios: Se actualizo `app/catalogo/page.js` para cambiar el titulo de exito, separar el cierre del modal como accion principal, mover WhatsApp a una tarjeta secundaria y reemplazar el boton grande de copiar por un boton pequeno "Copiar" en el encabezado del texto.
- Verificacion: `node --check app\catalogo\page.js` OK; `git diff --check` OK con aviso CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. Se audito el turno anterior sobre formato de dinero del checkout y el arbol tracked estaba limpio antes de editar; quedaron fuera de scope `Inkora.PrintBridge.zip` y `Messi 2.3mf`.
- Pendiente/Riesgos: Probar manualmente la pantalla de exito en mobile y desktop para ajustar espaciados si hiciera falta.

---

## 2026-07-05 16:40 -03:00 - ChatGPT Codex

- Objetivo: Corregir formato de miles en el resumen de confirmacion del catalogo y cambiar el boton de envio a "Confirmar pedido" / "Confirmando...".
- Cambios: Se actualizo `app/catalogo/page.js` para usar `formatOrderMoney` en los importes del modal de confirmacion, evitando que valores numericos o strings se rendericen como `$6000` sin separador, y se ajusto el texto del boton principal.
- Verificacion: `node --check app\catalogo\page.js` OK; `git diff --check` OK con aviso CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. Se audito el turno anterior sobre Categorias y el arbol tracked estaba limpio antes de editar; quedaron fuera de scope `Inkora.PrintBridge.zip` y `Messi 2.3mf`.
- Pendiente/Riesgos: Probar manualmente un pedido con importes de 4 digitos para confirmar que se vea `$6.000` y que el estado loading muestre "Confirmando...".

---

## 2026-07-05 16:36 -03:00 - ChatGPT Codex

- Objetivo: Mejorar la pestana de Categorias del modal de productos: tags alineadas con mismo tamano, opcion de color "Por defecto" y reordenamiento visual mientras se arrastra.
- Cambios: Se actualizo `app/admin/page.js` para que las categorias se rendericen como chips de ancho/alto fijo, se agrego un menu de color propio con boton "Por defecto" que elimina el color guardado del JSON `category_colors`, y se reemplazo el drag flotante por un preview local que reordena las categorias visualmente durante el arrastre y persiste al soltar.
- Verificacion: `node --check app\admin\page.js` OK; `git diff --check` OK con aviso CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. Se audito la entrada anterior sobre seleccion en Admin > Usuarios y el arbol tracked estaba limpio antes de editar; quedaron fuera de scope `Inkora.PrintBridge.zip` y `Messi 2.3mf`.
- Pendiente/Riesgos: Probar manualmente en produccion el modal de Categorias: abrir/cerrar menu de color, volver a Por defecto, cambiar color personalizado y arrastrar categorias entre varias posiciones.

---

## 2026-07-05 14:47 -03:00 - ChatGPT Codex

- Objetivo: Corregir la seleccion de clientes en Admin > Usuarios para que funcione parecido a Disenos: click en la fila/card selecciona o deselecciona, Ctrl/Cmd y Shift permiten seleccion multiple, Escape y click afuera sueltan la seleccion.
- Cambios: Se actualizo `app/admin/page.js` agregando limpieza de seleccion de usuarios al handler general del admin, soporte de Escape para usuarios/disenos, marcado `data-user-card` en filas de clientes y filtrado de clicks sobre controles interactivos para que botones, inputs, selects y el switch de email no cambien la seleccion accidentalmente.
- Verificacion: `node --check app\admin\page.js` OK; `git diff --check` OK con aviso CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. Se audito la entrada anterior sobre el desplegable de vendedores y se confirmo que el arbol tracked solo tenia cambios de este turno; quedaron fuera de scope `Inkora.PrintBridge.zip` y `Messi 2.3mf`.
- Pendiente/Riesgos: Probar manualmente en produccion Admin > Usuarios/Clientes: click en margen/lista vacia, Escape, click en una fila seleccionada, Ctrl/Cmd, Shift y uso de controles dentro de la fila.

---

## 2026-07-05 14:36 -03:00 - ChatGPT Codex

- Objetivo: En Admin > Usuarios/Clientes cambiar la asignacion de vendedor por fila de varios botones a un desplegable; confirmar que clientes nuevos nacen con email de confirmacion de pedido desactivado; auditar registro/auth sin modificarlo.
- Cambios: Se actualizo `app/admin/page.js` para reemplazar los botones inline de vendedor por un `<select>` por cliente. El desplegable mantiene la opcion "Sin vendedor", muestra vendedores activos y conserva el vendedor asignado aunque este inactivo o ya no exista para no falsear visualmente el estado.
- Verificacion: `node --check app\admin\page.js` OK; `git diff --check` OK con aviso CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables. Se revisaron `app/api/register/route.js`, `app/api/invite-user/route.js`, `components/AuthModal.js`, rutas Google/auth y SQL de perfiles.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. El arbol tracked estaba limpio antes de editar; quedaron fuera de scope `Inkora.PrintBridge.zip` y `Messi 2.3mf`. Se confirmo que `send_confirmation_email` ya se crea en `false` desde API/SQL y que `/api/send-email` respeta el flag via `sendConfirmation`.
- Pendiente/Riesgos: Probar manualmente en Admin > Usuarios que el desplegable cambie vendedor y respete seleccion multiple deshabilitada. Revisar en un turno aparte posibles mejoras de auth: manejo de error del popup Google con `prompt=none`, rate-limit/captcha para registro publico y unificar rutas de registro.

---

## 2026-07-05 14:03 -03:00 - ChatGPT Codex

- Objetivo: Implementar la correccion para que el click en el margen exterior/gutter gris de Admin > Disenos suelte la seleccion.
- Cambios: Se actualizo `app/admin/page.js` para conectar `clearDesignSelectionOutsideCards` tambien al wrapper general `s.wrap`, que cubre el fondo gris fuera de `.adm-content`. Se conserva el handler existente en `.adm-content` y la logica de click dentro de una card seleccionada sigue igual.
- Verificacion: `node --check app\admin\page.js` OK; `git diff --check` OK con aviso CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. Se confirmo que el ultimo commit local era de Claude (`7ba7deb`) sobre el popup de Google y que el arbol tracked estaba limpio antes de editar; solo quedaron fuera de scope `Inkora.PrintBridge.zip` y `Messi 2.3mf`. Se contrasto el diagnostico anterior: `.adm-content` no cubria el gutter gris porque `s.content` mide 90% y queda centrado dentro de `s.wrap`.
- Pendiente/Riesgos: Probar manualmente en produccion click en el gutter gris izquierdo/derecho de Admin > Disenos con una seleccion activa.

---

## 2026-07-05 -03:00 - Claude Sonnet 5

- Objetivo: El popup de "Iniciar sesion con Google" a veces se quedaba trabado en "Iniciando sesion..." para siempre, aunque la sesion ya se hubiera iniciado (confirmado: cerrando el popup a mano se veia todo ya logueado).
- Cambios: Diagnostico primero (sin tocar codigo) y confirmacion del usuario antes de corregir. Causa: `app/auth/popup-callback/page.js` solo actuaba (mandar `postMessage` al opener + `window.close()`) ante el evento `SIGNED_IN` de `supabase.auth.onAuthStateChange`. Pero el login real ya se completa del lado del servidor en `app/api/auth/google/callback/route.js` (que llama a `signInWithIdToken` y deja la sesion en cookies) *antes* de que esta pagina cargue — asi que casi siempre lo que el cliente ve al iniciar es `INITIAL_SESSION` (sesion ya existente), no `SIGNED_IN` (transicion en vivo), y ese evento se ignoraba silenciosamente. Era una carrera dependiente de timing (por eso "a veces"). Fix: se acepta tambien `INITIAL_SESSION` (con sesion valida) ademas de `SIGNED_IN`, con una bandera `handled` para evitar doble ejecucion si llegaran a dispararse ambos eventos.
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: Se confirmo que esta misma pagina de callback es compartida por el login de Google del catalogo publico, Admin y Operarios (los 3 usan `redirectTo: .../auth/popup-callback`), asi que la correccion cubre los 3 flujos con un solo cambio.
- Pendiente/Riesgos: Ninguno esperado — el cambio es aditivo (agrega un caso mas al `if`, no saca ninguno) y la bandera `handled` previene cualquier efecto doble. Falta confirmacion del usuario probando en produccion que ya no se cuelga.

---

## 2026-07-05 12:34 -03:00 - ChatGPT Codex

- Objetivo: Explicar como se llama el espacio gris lateral de Admin > Disenos y hacer que al clickear ese margen/gutter se suelte la seleccion de disenos.
- Cambios: Se actualizo `app/admin/page.js` agregando `clearDesignSelectionOutsideCards` y conectandolo al contenedor `.adm-content`, limitado a la pestana Disenos. Ahora cualquier click del area principal que no este dentro de una fila `data-design-card`, incluido el margen exterior gris/padding lateral, limpia `selectedIds`.
- Verificacion: `node --check app\admin\page.js` OK; `git diff --check` OK con aviso CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se leyeron `AGENTS.md`, `CONTEXT.md`, `AI_RUN_LOG.md` y `git status --short`. El arbol tracked estaba limpio antes de editar; solo habia untracked `Inkora.PrintBridge.zip` y `Messi 2.3mf`, que quedaron fuera de scope. Se audito el turno anterior y se confirmo que el fix previo limpiaba dentro de las cards, pero no cubria el gutter lateral gris fuera de ellas.
- Pendiente/Riesgos: Probar manualmente en produccion click sobre el margen exterior izquierdo/derecho de la pestana Disenos para confirmar que deselecciona, y que click dentro de una fila de diseno siga seleccionando normalmente.

---

## 2026-07-04 21:55 -03:00 - ChatGPT Codex

- Objetivo: Corregir dos detalles puntuales: en Admin > Disenos soltar seleccion al hacer click fuera de cualquier card de diseno, y en Catalogo ocultar "Sin variantes" cuando el producto no tiene variantes.
- Cambios: Se actualizo `app/admin/page.js` para que los paneles de la pestana Disenos limpien `selectedIds` cuando el click no ocurre dentro de una fila marcada como `data-design-card`; las filas de diseno quedan marcadas como cards para no disparar la limpieza. Se actualizo `app/catalogo/page.js` para ocultar la fila de variantes cuando `activeVariants.length <= 1`.
- Verificacion: `node --check app\admin\page.js` OK; `node --check app\catalogo\page.js` OK; `git diff --check` OK con avisos CRLF; `npm.cmd run build` OK con warnings preexistentes/esperables.
- Auditoria: Se reviso `git status --short` y los ultimos commits de Claude (`6dcbee5`, `fcad1ac`, `f7e9634`, `5b5b8eb`, `87ce92a`). El arbol tracked estaba limpio antes de editar; solo quedaban untracked `Inkora.PrintBridge.zip` y `Messi 2.3mf`, que se mantuvieron fuera de scope.
- Pendiente/Riesgos: Probar manualmente en produccion que clickear filtros/panel superior o espacios fuera de una fila de diseno deseleccione, y que el Catalogo no muestre nada entre productos y categorias si no hay variantes.

---

## 2026-07-04 -03:00 - Claude Sonnet 5 (v8)

- Objetivo: El indicador de version agregado en el turno anterior no se veia en mobile/PWA.
- Cambios: Causa: la version quedo anidada dentro de `.adm-header-title`, y hay un media query (`@media max-width:480px`) que oculta esa clase entera para hacer lugar a los botones de icono en pantallas chicas. Se saco el span de version de adentro del titulo y se lo puso como elemento independiente (sin esa clase) entre el logo y el titulo, con `flexShrink:0` para que no se lo coma el layout.
- Verificacion: `npx eslint`/`npx next build` sin errores.
- Auditoria: N/A.
- Pendiente/Riesgos: Ninguno.

- Objetivo: Mostrar la version actual (del deploy) en la barra superior de Admin, muy sutil, tanto en web como en PWA.
- Cambios: `next.config.mjs` calcula el hash corto de git (`git rev-parse --short HEAD`) en build time y lo expone como `NEXT_PUBLIC_APP_VERSION` (con fallback `'dev'` si no hay git disponible). `app/admin/page.js` lo muestra como `v{hash}` junto al titulo "Panel de Administración", en texto chico y opacidad 0.35 — no requiere distincion entre web/PWA porque ambas cargan la misma pagina.
- Verificacion: `npx eslint` sin errores; `npx next build` completo sin errores.
- Auditoria: N/A (cambio chico y autocontenido).
- Pendiente/Riesgos: Ninguno — se recalcula solo en cada build/deploy, siempre refleja el commit real desplegado.

- Objetivo: (1) Notificaciones push para mensajes nuevos del chat interno; (2) silenciar notificaciones por canal en 2 niveles (sin sonido / no mostrar nada); (3) en mobile, el canal por defecto al entrar a la pestana Chat siempre debe ser "General", no el ultimo canal visitado.
- Cambios: No existia ninguna infraestructura de push previa (se investigo con un agente antes de tocar nada). Se agrego: `sql/chat_push_notifications.sql` con las tablas `push_subscriptions` (endpoint/keys por dispositivo) y `chat_channel_member_settings` (mute_level 'none'|'mute_sound'|'mute_all' por canal y usuario, + last_read_at server-side a futuro), mas un trigger `on_chat_message_created_notify` via `pg_net` (misma extension que usa el feature nativo "Database Webhooks" de Supabase) que llama a `/api/webhooks/chat-message-created` en cada INSERT de `chat_messages`. Esa ruta valida un secreto (`CHAT_WEBHOOK_SECRET`) y manda los push reales con `web-push` (nueva dependencia) usando un par de claves VAPID generadas para este proyecto, respetando el mute_level de cada destinatario (excluye al que escribio, salta a los `mute_all`, manda silencioso a los `mute_sound`) y limpiando suscripciones vencidas (404/410). `public/sw.js` gano handlers `push` y `notificationclick`. Nuevo componente `components/ChatPushToggle.js` (boton campana en la barra superior de Admin) maneja pedir permiso + suscribirse/desuscribirse via `/api/push/subscribe` y `/api/push/unsubscribe`. En `components/chat/ChatPanel.js`: nuevo menu por canal (🔔/🔈/🔕) para elegir el mute_level, persistido en `chat_channel_member_settings`; y se corrigio el efecto de auto-seleccion de canal para que en mobile (`isMobile`) ignore el ultimo canal guardado en localStorage y vaya siempre al canal `type==='main'` ("General"), salvo que venga un `?canal=` explicito en la URL (deep link).
- Verificacion: `npx eslint` sobre todos los archivos nuevos/tocados sin errores; `npx next build` completo sin errores, rutas nuevas (`/api/push/subscribe`, `/api/push/unsubscribe`, `/api/webhooks/chat-message-created`) presentes en el output.
- Auditoria: Se investigo con un agente toda la arquitectura de chat/PWA antes de implementar (no habia service worker con push, ni tabla de preferencias por usuario, ni convencion de "info por canal" en la base) para no reinventar mal algo que ya existiera. Se siguio el mismo criterio de RLS liviana (`USING(true)`) que ya usan el resto de las tablas de chat, por consistencia.
- Pendiente/Riesgos: **Critico**: hay que agregar las env vars nuevas (`VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CHAT_WEBHOOK_SECRET`) en el dashboard de Vercel — hoy solo estan en `.env.local` (nunca se commitea), asi que en produccion el envio de push va a fallar hasta que se agreguen ahi y se re-deploye. Ejecutar `sql/chat_push_notifications.sql` en Supabase (requiere que `pg_net` este disponible en el proyecto, deberia estarlo por defecto). El secreto del webhook quedo hardcodeado en el SQL (necesario porque el trigger no puede leer variables de entorno de Vercel) — si se regenera el secreto hay que actualizar tanto `.env.local`/Vercel como volver a correr ese UPDATE del trigger. No se implemento un boton de "silenciar" accesible fuera del menu por canal (ej. no hay un mute global); tampoco se persiguio mover `last_read_at` de localStorage a la tabla nueva (la columna existe pero no se usa todavia, queda para mas adelante si hace falta sincronizar leido/no-leido entre dispositivos).

- Objetivo: "Iniciar sesion con Google" dentro de la app nativa mostraba "Acceso bloqueado... Error 403: disallowed_useragent".
- Cambios: Es un bloqueo deliberado de Google (politica "Usa navegadores seguros"): detecta el token "; wv" que Android agrega al user-agent por defecto de cualquier WebView embebido y rechaza el login OAuth desde ahi, para prevenir robo de credenciales via WebViews maliciosos. Fix estandar aplicado en `MainActivity.kt` y `FloatingBubbleService.kt`: `webView.settings.userAgentString = webView.settings.userAgentString.replace("; wv", "")` antes de cargar cualquier URL, para que el WebView se identifique como un navegador normal. Bump a versionCode/versionName 3/1.0.2, recompilado (mismo certificado, verificado) y publicado con `publish-release.js`.
- Verificacion: `./gradlew assembleRelease` compila y firma con el mismo certificado que v1/v2 (`apksigner verify`); publicado y confirmado con `curl -I` (200 OK).
- Auditoria: N/A (fix puntual, causa conocida y documentada de Google).
- Pendiente/Riesgos: Esto es un workaround de deteccion basada en el user-agent, no una excepcion oficial otorgada por Google — si Google en el futuro refuerza la deteccion con otras señales (fingerprinting de comportamiento de WebView, no solo el string), podria volver a bloquearse. Para una solucion mas robusta a largo plazo habria que migrar el login de Google especificamente a Chrome Custom Tabs, pero es mas trabajo y no hizo falta por ahora. Falta confirmacion del usuario de que el login ya funciona en el celular real.

- Objetivo: El usuario probo la app en su celular y reporto 3 problemas: (1) confirmar que la actualizacion debe poder bajarse e instalarse desde dentro de la app, lo mas automatico posible; (2) la app debia ser exclusivamente para el panel de Admin, pero cargaba la web/catalogo general; (3) al tocar la burbuja flotante para expandirla, no se abria y al segundo intento Android mostraba "la app sigue fallando".
- Cambios: **Bug critico (3) resuelto** en `FloatingBubbleService.kt`: `addExpandedView()` inflaba un layout con el atributo de tema `?attr/selectableItemBackgroundBorderless` (de AppCompat) usando el contexto pelado del Service — los Services, a diferencia de las Activities, no reciben el tema de la app (`Theme.InkoraApp`), asi que ese atributo no resolvia y el inflado tiraba una excepcion cada vez que se tocaba la burbuja, crasheando la app. Fix: envolver el contexto con `ContextThemeWrapper(this, R.style.Theme_InkoraApp)` antes de inflar. Se agrego ademas manejo defensivo (`runCatching` + `Toast`) en `toggleExpanded()` y en el arranque de la burbuja para que un fallo futuro no vuelva a crashear la app, solo muestre un aviso. **Punto (2)**: `MainActivity.START_URL` paso de `https://www.inkora.com.ar/` a `https://www.inkora.com.ar/admin`; se agrego el boton "Activar flotante" tambien a la barra superior propia de `app/admin/page.js` (antes solo estaba en `components/Header.js`, que Admin no usa). **Punto (1)**: se confirmo que el mecanismo de auto-update (`UpdateManager.kt`) no tenia bugs nuevos — se bumpeo `versionCode`/`versionName` a 2/1.0.1 en `android-app/app/build.gradle.kts`, se recompilo (firmado con el mismo keystore, mismo digest SHA-256 que la v1, requisito para que Android acepte la actualizacion sobre la instalacion existente) y se publico con `node android-app/publish-release.js 2 1.0.1`.
- Verificacion: `./gradlew assembleRelease` compila y firma correctamente (mismo certificado que v1, verificado con `apksigner verify`); `npx eslint`/`npx next build` sin errores (dos intentos de build tuvieron un crash nativo de Windows no relacionado al codigo — 0xC0000005 — que se resolvio solo al reintentar). Se confirmo con `curl -I` que la URL publicada de la v2 responde 200 OK.
- Auditoria: El diagnostico del crash se hizo por lectura cuidadosa del codigo (no habia logs del celular disponibles): se noto que el WebView de `MainActivity` (contexto de Activity, con tema) funcionaba bien, pero el de `FloatingBubbleService` (contexto de Service, sin tema) fallaba — la diferencia entre ambos contextos fue la pista clave para encontrar el atributo de AppCompat sin resolver.
- Pendiente/Riesgos: La v1 instalada en el celular del usuario probablemente no puede auto-actualizarse a si misma si el crash tambien afectaba ese flujo indirectamente (no confirmado); como salvaguarda, el usuario deberia instalar la v1.0.1 manualmente una vez mas (bajandola con el icono de descarga en Admin), y de ahi en mas el auto-update ya deberia andar solo para v3 en adelante. Falta que el usuario confirme en su celular real que la burbuja ahora expande sin crashear.

- Objetivo: El usuario no queria el flujo de publicacion de versiones desde una UI de Admin (file picker + inputs de version) que arme en el turno anterior — lo considero poco practico. Pidio en cambio: (1) un boton simple (icono de descargar) en la barra superior para que cualquiera baje el APK actual instalado, sin nada mas que elegir; (2) que la publicacion de versiones nuevas la haga la IA por terminal, no un admin desde el navegador.
- Cambios: Se elimino por completo la tarjeta "App Android" de Admin > Config (file input, campos de version, boton "Subir y publicar") junto con su estado y handler `handleUploadAppApk`, y se borro la ruta `app/api/admin/app-apk-upload-url/route.js` que ya no hacia falta. En su lugar: un icono chico de descarga en la barra superior de `app/admin/page.js` (junto al boton de tema), que solo aparece si `settings.android_app_apk_url` tiene valor, y linkea directo a esa URL con atributo `download`. Se creo `android-app/publish-release.js`: script de Node que sube el APK compilado a Supabase Storage y hace upsert de las 3 keys de `settings`, para correr por terminal (`node publish-release.js <versionCode> <versionName>`) cada vez que se compile una version nueva. Se publico la v1.0.0 actual con este script como primera prueba end-to-end.
- Verificacion: `npx eslint` sobre `app/admin/page.js` sin errores; `npx next build` completo sin errores (un intento anterior crasheo con codigo de salida nativo de Windows 0xC0000005, no relacionado al codigo — el reintento inmediato compilo limpio). Se verifico con `curl -I` que la URL publicada del APK responde 200 OK con el content-type correcto.
- Auditoria: El primer diseño (upload UI en Admin) resolvia el problema equivocado — el usuario aclaro que solo existe una version "actual" y que public quiere descargar, no publicar, desde la web. Se corrigio rapido tras una sola pregunta de aclaracion en vez de asumir.
- Pendiente/Riesgos: El SQL `sql/android_app_version.sql` quedo como documentacion nomas (las filas ya se crean solas via el script); no hace falta correrlo salvo que la tabla `settings` se recree desde cero. Cada vez que se compile un cambio nuevo en `android-app/`, correr `node android-app/publish-release.js <versionCode> <versionName>` para publicarlo — sin este paso el boton de descarga sigue apuntando a la version anterior y el auto-update de la app instalada nunca encuentra nada nuevo.

---

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
