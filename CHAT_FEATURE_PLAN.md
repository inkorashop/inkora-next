# Plan: Chat interno del admin (reemplaza la pestaña "Notificaciones")

Estado: **V1 IMPLEMENTADO en codigo** (2026-07-04). Falta un paso manual antes de que funcione en produccion: **ejecutar `sql/chat.sql` en Supabase SQL Editor** (crea las tablas, el canal "General", el trigger que espeja `admin_notifications` y el alta en realtime). Tambien falta configurar la variable de entorno `CRON_SECRET` en Vercel (opcional, endurece el cron de limpieza de imagenes) y probar el flujo end-to-end en un navegador con sesion de admin real (no se pudo probar en esta sesion por falta de credenciales de login).

Archivos nuevos: `sql/chat.sql`, `vercel.json` (cron diario), `app/api/cron/expire-chat-images/route.js`, `lib/chat-helpers.js`, `components/chat/ChatPanel.js`, `components/chat/ChatReferencePicker.js`, `components/chat/ChatNewChannelModal.js`. Modificado: `app/admin/page.js` (tab "Notificaciones" ahora renderiza `<ChatPanel>`, label cambiado a "Chat").

No implementado a proposito (fuera de alcance de V1, ver seccion Fases): push notifications, recibos de lectura, presencia/"escribiendo...".

Fecha de este plan: 2026-07-04.
Contexto general del repo: leer primero `AGENTS.md` (protocolo) y `CONTEXT.md` (contexto estable del proyecto).

## Objetivo

Reemplazar la pestana actual "Notificaciones" del panel admin (`app/admin/page.js`, `activeTab === 'notifications'`) por un chat interno tipo WhatsApp, de uso exclusivamente interno (admins, operadores de produccion, vendedores). No es para datos sensibles de la empresa (para eso ya usan WhatsApp real), asi que la seguridad puede ser liviana.

## Por que reusar tanto del codigo existente

Investigacion previa confirmo que gran parte de la infraestructura necesaria ya existe en el proyecto:

- **Realtime ya resuelto**: patron `watch(table, reload)` en `app/admin/page.js` (~linea 1625) usado en ~14 tablas via canales de Supabase (`postgres_changes`) con debounce de 250ms. El chat solo necesita sumar sus tablas a ese mismo mecanismo (y a `sql/admin_realtime.sql`), no hace falta infraestructura nueva de tiempo real.
- **Identidad de usuarios del chat**: se arma a partir de las tablas que ya existen — `admins`, `production_operators`, `sellers` — todas con email. No hace falta una tabla de "usuarios" nueva, solo un helper "email -> nombre para mostrar".
- **Restriccion al dueno**: ya existe el patron `realUser === 'inkorashop@gmail.com'` (~linea 5039) usado para `canImpersonate`. Se reusa igual para "solo inkorashop crea canales nuevos y agrega miembros".
- **Deep-link a Pedidos y Produccion**: ya existen. Ambos se abren hoy via query param `?pedido=<id>` que restaura el modal/seleccion al cargar la pagina (pedidos: `setOrderDetail`, ~linea 4932/7002, sync de URL ~linea 1226; produccion: `productionSelectedOrderId`, ~linea 531/1182, mismo query param cuando `productionSubtab === 'produce'`).
- **Deep-link a Disenos**: **no existe todavia.** Hoy un diseno se abre solo por estado interno del componente (seleccion + scroll dentro del tab `designs`), sin query param. Esto es lo unico nuevo a construir para que `/diseno` funcione como link real (agregar algo tipo `?diseno=<id>` que al cargar `/admin` abra la preview de ese diseno puntual).
- **Subida de imagenes**: reusar `/api/upload-image` (bucket `assets`, `cacheControl: 31536000`) + el mismo pipeline de compresion cliente (canvas -> WebP) que ya se uso para las miniaturas de disenos.
- **Limpieza automatica de archivos**: no existe ningun cron ni TTL en todo el proyecto hoy. Es la unica pieza de infraestructura genuinamente nueva (un cron de Vercel).

## Modelo de datos propuesto

Tablas nuevas (nombres tentativos, seguir convencion `snake_case` del proyecto):

- **`chat_channels`**: `id`, `name`, `type` (`'main'` | `'group'`), `created_by` (email), `created_at`.
- **`chat_channel_members`**: `channel_id`, `email`, `added_by`, `joined_at`.
- **`chat_messages`**: `id`, `channel_id`, `sender_email` (nullable, null = mensaje de sistema/notificacion), `body` (texto), `reply_to_id` (nullable, FK a otro `chat_messages.id`), `reference` (jsonb, ver abajo), `image_url` (nullable), `image_expires_at` (nullable), `edited_at` (nullable), `deleted_at` (nullable), `created_at`.
- **`chat_message_mentions`**: `message_id`, `mentioned_email`. Se puebla al enviar el mensaje (parseando `@usuario` contra los miembros del canal), no se parsea recien al mostrar. Preparado para que un futuro push notification pueda consultar "menciones pendientes de notificar a este usuario" sin tener que reprocesar mensajes viejos.

El campo `reference` (jsonb, ej. `{type: 'order'|'production'|'design', id, label}`) es la clave para que `/pedido`, `/produccion` y `/diseno` sean **links reales**, nunca texto libre: al escribir el comando se abre un buscador (mismo patron que ya usa el admin para buscar pedidos/disenos), el usuario elige un registro puntual, y se guarda la referencia estructurada. Nunca se adivina un ID desde texto.

## Reglas de negocio confirmadas

1. **Canal principal "General"**: se crea automaticamente (migracion inicial), con todos los admins/operadores/vendedores ya agregados como miembros. Cualquiera puede escribir ahi. Las notificaciones del sistema (hoy en `admin_notifications` / generadas via `trackAdminActivity`) llegan como mensajes a este canal (sender_email null), con su `reference` correspondiente (ej. pedido nuevo -> reference al pedido). Al ser mensajes normales, se pueden responder y clickear igual que cualquier otro mensaje — no es un sistema paralelo.
2. **Canales nuevos**: solo `inkorashop@gmail.com` puede crearlos y elegir los miembros especificos.
3. **Editar y borrar mensajes propios**: ventana de 12 horas para usuarios normales, sin limite de tiempo para `inkorashop@gmail.com`. Misma regla de tiempo para ambas acciones.
   - Editar: actualiza `body`, refresca `edited_at`. Se muestra "Editado" al lado de la hora (sin historial de versiones del mensaje, igual que WhatsApp).
   - Borrar: **soft delete**. No se elimina la fila (para no romper mensajes que la citan via `reply_to_id`). Se vacia `body`/`image_url`, se marca `deleted_at`, se muestra "Se elimino este mensaje".
4. **Imagenes**: limite duro de 5MB antes de subir (comprimir con el mismo pipeline de disenos; rechazar si sigue pasandose). Expiran a los 7 dias: un cron diario (Vercel Cron, primera vez que se usa en este proyecto) borra el archivo del bucket `assets` y limpia `image_url`/marca `image_expires_at` pasado, mostrando placeholder tipo "Imagen expirada". El resto del mensaje (texto) queda intacto.
5. **Seguridad liviana a proposito**: uso interno, sin datos sensibles de la empresa. El mismo criterio de pertenencia a `admins`/`production_operators`/`sellers` alcanza para decidir quien ve/escribe en cada canal. No dedicarle tiempo extra a politicas RLS elaboradas.

## Arquitectura tecnica

- **Mensajeria en tiempo real**: Supabase Realtime sobre `chat_messages` (y probablemente `chat_channel_members`), reusando el patron `watch()` ya probado en el proyecto (no es una tecnologia nueva ni un servicio externo — Supabase Realtime escucha el WAL de Postgres y empuja por WebSocket a los clientes suscritos, la misma categoria de tecnologia que usan chats reales).
- **Presence** de Supabase Realtime para "en linea" / "escribiendo..." (mismo mecanismo que ya usa `admin_presence`).
- **UI optimista**: al enviar, el mensaje se muestra de inmediato con un ID temporal del lado del cliente ("enviando..."), se reemplaza por la fila real al confirmarse el insert (via respuesta directa o via realtime).

## UI/UX — foco fuerte, similar a WhatsApp en lo posible

- Lista de canales: ultimo mensaje, hora, contador de no leidos.
- Conversacion: burbujas agrupadas por remitente consecutivo, separadores de fecha.
- Responder: banner de cita arriba del input; click en la cita scrollea al mensaje original.
- Autocompletado al escribir `@` (miembros del canal) y `/` (pedido, produccion, diseno -> abre buscador puntual).
- Editar/borrar via menu contextual (long-press en mobile / hover en desktop), respetando las reglas de tiempo de arriba.
- Visor de imagen a pantalla completa: reusar el modal ya construido para preview de disenos en el admin.
- Input mobile-friendly que no quede tapado por el teclado (cuidado con `100dvh` / `visualViewport`, problema clasico de web mobile).
- Lo que WhatsApp no tiene y hay que sumar: referencias reales a pedidos/produccion/disenos, notificaciones del sistema integradas como mensajes normales del canal "General".

## Fases

- **V1** (todo lo de arriba menos push): canales, mensajes de texto e imagen, responder, editar/borrar con reglas de tiempo, @menciones (guardadas en tabla propia pero solo resaltado visual por ahora), `/pedido` `/produccion` `/diseno` como referencias reales, notificaciones integradas, funciona en mobile y desktop.
- **V2** (mas adelante): push notifications (usando `chat_message_mentions` + eventos de mensaje nuevo, ya charlado en el marco mas amplio de "hacer PWA del admin"), posibles recibos de lectura (doble check).

## Pendiente antes de programar (si retomas esto)

- Definir el paso a paso de implementacion (SQL primero, luego backend/API routes, luego UI) — no se llego a definir en detalle, solo el "que" y las reglas, no el orden exacto de tareas.
- Confirmar con el usuario si el plan sigue vigente tal cual, sobre todo si paso tiempo o cambio de idea en algun punto.
- Revisar si en el momento de implementar sigue siendo cierto que no hay cron/TTL en el proyecto y que no hay deep-link de disenos (por si alguna otra tarea lo agrego mientras tanto).
