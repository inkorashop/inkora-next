# Cache de imagenes del catalogo (proxy propio, sin depender de Supabase Pro)

Estado: **implementado y en produccion** (agregado 2026-07-04, documentado 2026-07-09 tras una investigacion sobre Cached Egress de Supabase). Leer esto antes de tocar `app/api/asset/[...path]/route.js`, `components/SafeImage.js`, o de recomendar pasar a Supabase Pro para "arreglar" el cacheo de imagenes — ya esta resuelto del lado del codigo, no hace falta pagar el plan.

## El problema que resuelve

Supabase Storage en plan Free **no respeta el `cacheControl` que se configura al subir un archivo** en el header real que le llega al navegador — devuelve `Cache-Control: no-cache` sin importar qué se haya declarado en el upload. La función que sí hace que ese `cacheControl` se traduzca en un header real (para el navegador y para el propio CDN de Supabase) es "Smart CDN", y esa función es exclusiva de plan Pro en adelante. Confirmado en vivo: un `curl -I` directo a una URL cruda de `supabase.co/storage/v1/object/public/...` devuelve `Cache-Control: no-cache` aunque la fila en `storage.objects` diga `cacheControl: max-age=31536000`.

## La solución (ya construida)

- **`app/api/asset/[...path]/route.js`**: ruta propia que trae el archivo de Supabase Storage del lado del servidor (`fetch` directo a la URL pública) y lo re-sirve con `Cache-Control: public, max-age=31536000, immutable` real — un header que Supabase nunca manda pero que nosotros sí controlamos.
- **`components/SafeImage.js`**: componente que reemplaza a `<img>` en todo el código de cara al cliente. Su función `normalizeAssetUrl()` detecta si un `src` es una URL cruda de Supabase Storage pública (`/storage/v1/object/public/assets/...`) y la reescribe a `/api/asset/<path>` — o sea, el cambio de URL es automático, nadie tiene que acordarse de armar la URL del proxy a mano.

## Por qué es seguro cachear "para siempre" (`immutable`)

Las imágenes optimizadas se suben con un nombre de archivo que incluye un timestamp fresco cada vez (`optimized/designs/<id>/thumb-<targetKb>kb-<Date.now()>.<ext>`, ver `app/api/admin/design-optimized-image/route.js:42`), y el archivo anterior se borra aparte (línea 99 de ese mismo archivo). Es decir: cada versión de una imagen tiene su propia URL única — nunca se sobrescribe el mismo path con contenido distinto. Por eso cachear "para siempre" no tiene riesgo de servir una imagen vieja: si la imagen cambia, cambia la URL, y la vieja simplemente deja de pedirse.

## Verificado en producción (2026-07-09)

```
curl -sI https://www.inkora.com.ar/api/asset/<path-de-un-diseno>
# 1er pedido:  X-Vercel-Cache: MISS   (pero ya con el header correcto)
# 2do/3er pedido a la MISMA imagen: X-Vercel-Cache: HIT  (Age > 0)
```

Esto confirma que hay dos capas de cache funcionando, sin depender de Supabase Pro:
1. **Navegador del visitante**: con `max-age=31536000, immutable`, un visitante que vuelve no vuelve a pedir la imagen en absoluto mientras no se le borre el cache local.
2. **Edge de Vercel**: cachea la respuesta del proxy también — un visitante DISTINTO que pide la MISMA imagen la recibe desde el borde de Vercel, sin que nuestra función ni Supabase se enteren. El "HIT" es por nodo/región de Vercel (no instantáneo en todo el mundo a la vez), así que el primer visitante de cada región igual paga el costo una vez — eso es normal y esperable de cualquier CDN.

## Cobertura confirmada

Se revisó con grep exhaustivo: **todo punto de render de imagen de cara al cliente usa `SafeImage`** (grilla del catálogo, carrito, landing, fallback de modelos 3D, chat) — `app/catalogo/page.js`, `app/page.js`, `components/chat/ChatPanel.js`, `components/chat/ChatReferencePicker.js`, `components/Header.js`. Se confirmó también que el 100% de las URLs guardadas en `designs.image_url`/`optimized_image_url`/`model_url` matchean el patrón que `normalizeAssetUrl()` sabe reescribir (ningún host distinto, ninguna con query string que fragmentaría la cache).

**Extendido (2026-07-10) a dos huecos que quedaban**, encontrados al preguntar puntualmente por ellos:

- **`components/DesignThumb.js`** (usado en el panel de Admin — Diseños, y en cualquier lado que muestre una miniatura de diseño): usaba `<img>` directo con la URL cruda de Supabase. Ahora pasa `imageUrl` por `normalizeAssetUrl()` antes de usarla (tanto para el `<img src>` como para lo que se le pasa a `openLightbox`), sin necesidad de adoptar el componente `SafeImage` completo (no hacía falta su lógica de fallback/retry acá).
- **El modelo 3D en sí** (`.glb`/`.3mf`): ni `components/ModelViewer.js` ni el precargador `LazyModelViewer` (`app/catalogo/page.js`) pasaban la URL por el proxy — se bajaban directo de Supabase con `Cache-Control: no-cache`, siendo el archivo más pesado de todo el catálogo. Se normaliza en dos puntos independientes (no es redundante, son dos fetches distintos): dentro de `ModelViewer` mismo (asi cualquier llamador, incluidos los del panel de Admin, lo hereda gratis sin tocar cada call site) y en el `fetch()` de precarga de `LazyModelViewer` (que corre ANTES de que el modelo se muestre, mientras la card solo es visible en pantalla).

`/api/asset/[...path]/route.js` no necesitó ningún cambio — ya reenvía cualquier `Content-Type` que diga Supabase (no está limitado a imágenes), así que sirve archivos `.glb`/`.3mf` sin modificaciones.

## Cómo confirmarlo desde el navegador (DevTools)

Chrome/Edge: F12 → pestaña **Network** → recargar la página. En la columna **Size**, una imagen servida desde el cache del navegador dice `(disk cache)` o `(memory cache)` en vez de un peso en KB. Filtrando por "Img" en la barra de tipos es más fácil de ver. En Firefox es la misma pestaña Network, columna "Transferred" en vez de "Size", mismo indicador de texto.
