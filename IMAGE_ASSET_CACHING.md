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

## Cobertura confirmada (y el hueco conocido que queda)

Se revisó con grep exhaustivo: **todo punto de render de imagen de cara al cliente usa `SafeImage`** (grilla del catálogo, carrito, landing, fallback de modelos 3D, chat) — `app/catalogo/page.js`, `app/page.js`, `components/chat/ChatPanel.js`, `components/chat/ChatReferencePicker.js`, `components/Header.js`. Se confirmó también que el 100% de las URLs guardadas en `designs.image_url`/`optimized_image_url`/`model_url` matchean el patrón que `normalizeAssetUrl()` sabe reescribir (ningún host distinto, ninguna con query string que fragmentaría la cache).

**Hueco conocido, de bajo impacto**: `components/DesignThumb.js` (usado solo en el panel de Admin, para el staff, no para clientes) sigue usando `<img>` directo con la URL cruda de Supabase, sin pasar por `SafeImage`/el proxy. No se tocó porque el volumen de tráfico de admin es marginal comparado con el catálogo público — si en algún momento se quiere prolijidad total, se puede migrar `DesignThumb` a `SafeImage` también, pero no es una prioridad de egress.

## Cómo confirmarlo desde el navegador (DevTools)

Chrome/Edge: F12 → pestaña **Network** → recargar la página. En la columna **Size**, una imagen servida desde el cache del navegador dice `(disk cache)` o `(memory cache)` en vez de un peso en KB. Filtrando por "Img" en la barra de tipos es más fácil de ver. En Firefox es la misma pestaña Network, columna "Transferred" en vez de "Size", mismo indicador de texto.
