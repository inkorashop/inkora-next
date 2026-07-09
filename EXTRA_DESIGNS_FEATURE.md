# Agregar un diseño extra a un pedido ya existente

Estado: **implementado y en produccion** (2026-07-09). Leer este archivo antes de tocar `add_order_extra_design`, `admin_sync_order_production_tasks`, `get_operator_production_tasks`, o el resumen "A producir" de Producción — el modelo de datos tiene una decisión de diseño no obvia (ver "Por qué no hay una tabla de historial" más abajo) que hay que entender antes de modificarlo.

Contexto general del repo: leer primero `AGENTS.md` (protocolo) y `CONTEXT.md` (contexto estable del proyecto).

## Qué hace

Deja agregar un diseño a un pedido que ya fue creado (por el cliente o a mano), sin reenviar emails ni tocar el checkout normal. Dos puntos de entrada, ambos llaman a la misma función:

- **"Ver pedido" (admin, `app/admin/page.js`)**: botón "+ Agregar diseño" arriba de la tabla de items. Llama a `add_order_extra_design(..., p_added_via: 'pedido')`.
- **Producción (`components/ProductionTab.js`)**: botón "+ Agregar diseño" en el encabezado del pedido seleccionado, visible para admin **y** operario. Llama a la misma RPC con `p_added_via: 'produccion'`.

Ambos entry points comparten el mismo mini-formulario (`components/AddExtraDesignForm.js`, fuzzy search sobre `designs` + stepper de cantidad) y el mismo ícono de auditoría hover (`components/InfoTooltip.js`).

## Regla de visibilidad (la parte no obvia)

El resaltado de "esto se agregó después" se muestra **solo en la vista donde se agregó**, no en ambas. Es decir, `added_via` no significa "quién puede verlo" — significa "en qué pantalla se marca":

| Agregado desde | Se ve resaltado en Pedido | Se ve resaltado en Producción |
|---|---|---|
| Pedido (admin) | Sí (fila con fondo verde claro + ícono "i") | No — fusionado, indistinguible de un item original |
| Producción (admin u operario) | No — fusionado | Sí (ícono "i" junto al nombre del diseño) |

Esto fue una decisión explícita del usuario, no una limitación técnica: agregar desde Pedido debe verse "normal" para quien mira Producción (para no generar ruido ahí), y viceversa. Si se pide mostrar el resaltado en ambos lados, es un cambio de spec, no un bug.

La columna **"a producir" de cada fila** (en la tabla de tareas de Producción) nunca muestra el desglose — siempre es el número plano `required_qty` de esa fila, misma lógica de siempre. El desglose "100 + 10" aparece **únicamente** en la tarjeta resumen "A producir" de arriba (suma de todo el pedido), y solo cuenta lo agregado con `added_via = 'produccion'` (lo agregado vía Pedido se suma silenciosamente al número base, sin aparecer en el "+").

## Modelo de datos

`production_order_tasks` tiene 5 columnas nuevas (`sql/order_extra_designs.sql`):

- `added_qty integer default 0` — cuánto de `required_qty` vino de adiciones posteriores a la creación del pedido (no el total de la fila, solo la parte agregada).
- `added_via text` — `'pedido' | 'produccion' | null`. Si una fila recibe una SEGUNDA adición más tarde (mismo diseño, más cantidad), este campo se pisa con el origen de la **última** adición, no guarda historial de todas.
- `added_by_email`, `added_by_name`, `added_at` — igual que `added_via`, reflejan la **última** adición sobre esa fila, no un historial completo.

### Por qué no hay una tabla de historial

Se evaluó una tabla de ledger separada (una fila por cada adición) pero se descartó: el pedido explícitamente solo necesitaba saber "esto tiene algo agregado, ¿cuánto, quién y cuándo fue lo último?", no un historial completo de N adiciones parciales. Guardar esto como columnas simples en la misma fila de `production_order_tasks` evita relaciones extra, joins, y sobre todo evita tener que tocar `admin_sync_order_production_tasks()` — esa función resincroniza `required_qty` sumando `orders.items` en cada resync, pero como nunca menciona las columnas `added_*` en su `UPDATE SET`, Postgres las deja intactas automáticamente en cada `ON CONFLICT` (las columnas no listadas en un `DO UPDATE SET` conservan su valor anterior). Si en el futuro hace falta un historial completo de adiciones, hay que migrar a una tabla aparte — no intentar acumular historial en estas columnas.

`add_order_extra_design(p_order_id, p_design_id, p_qty, p_added_via)`:

1. Verifica `is_admin()` o operario activo (`production_operators.active = true`) — **no** verifica que el operario ya esté asignado a ese pedido puntual. Es intencional (ver "Permisos" abajo).
2. Busca el nombre del diseño/producto en `designs`/`products` (recibe solo el `design_id`, no confía en nombres mandados por el cliente).
3. Agrega un item nuevo a `orders.items` (el jsonb), con `design_id`, `qty`, y los metadatos `added_by`/`added_by_name`/`added_via`/`added_at` embebidos en el item mismo — así "Ver pedido" (que lee `orders.items` directo) tiene el dato sin joins.
4. Hace upsert en `production_order_tasks` por `(order_id, design_key)`: si el diseño ya tenía una fila en ese pedido, **suma** `required_qty` y `added_qty` a lo existente (mismo `id` de fila, no crea una segunda fila para el mismo diseño); si no, crea una fila nueva.

## Permisos

No hay un permiso nuevo. Point de partida explícito del usuario: un operario técnicamente puede llamar esta RPC desde cualquier pedido (la función no chequea que el pedido esté asignado a él), pero en la práctica **solo puede llegar al botón** si ya tiene acceso a ver ese pedido en Producción — lo cual ya está gobernado por el sistema de visibilidad de pestañas/subpestañas existente (`resolveTabVisible`/`resolveSubtabVisible` en `app/admin/page.js`). Si en el futuro se quiere restringir esto más finamente (ej. "solo el operario asignado a ESE pedido puede agregar"), hay que agregar el chequeo dentro de la función — hoy no existe.

## Precio / total del pedido

Un diseño agregado por esta vía **no** lleva precio (no hay `pricePerUnit`/`subtotal` en el item nuevo) y **no** modifica `orders.total`. Esto es consistente con cómo ya se comportan los pedidos creados a mano desde "Nuevo pedido" (`total: 0` hardcodeado, ver `createAdminOrder`) — el foco de esta función es producción/fabricación, no facturación. `getOrderItemPricing` ya maneja items sin precio mostrando "—" en vez de romper, así que esto no requirió ningún cambio ahí.

## Bug preexistente encontrado y corregido de paso

Mientras se investigaba el esquema para esta feature, se encontró que `sql/production_order_tasks_position.sql` (turno anterior, para el orden del carrito en Producción) había hecho `CREATE OR REPLACE` de `admin_sync_order_production_tasks()` y `get_operator_production_tasks()` basándose en una copia vieja de esas funciones, anterior a `sql/fix_manual_link_persistence.sql` — pisando sin querer la protección de `is_manual_link` (una fila vinculada a mano vía `linkManualItemToDesign` en `ProductionTab.js`, para items sueltos de pedidos manuales sin diseño de catálogo, podía borrarse sola en el próximo resync, y el campo `is_manual_link` había dejado de exponerse en `get_operator_production_tasks()`). Se verificó antes de tocar nada que **0 filas** con `is_manual_link=true` existían en producción al momento del fix, así que no se detectó pérdida de datos real. `sql/order_extra_designs.sql` restaura ambas cosas de paso, ya que reescribe esas mismas funciones para esta feature. Ver el comentario dentro de ese archivo SQL para el detalle completo.

## Archivos involucrados

- `sql/order_extra_designs.sql` — migración completa (columnas nuevas, la función `add_order_extra_design`, y el fix de `is_manual_link`). Ya aplicada en producción.
- `components/AddExtraDesignForm.js` — mini-formulario compartido (fuzzy search + qty).
- `components/InfoTooltip.js` — ícono "i" hover genérico (fecha/hora + usuario), sin click, se cierra al instante al sacar el mouse.
- `app/admin/page.js` — botón + resaltado en el modal "Ver pedido" (buscar `addExtraDesignToOrder`).
- `components/ProductionTab.js` — botón + resaltado + desglose del resumen en Producción (buscar `addExtraDesignToOrder`).
