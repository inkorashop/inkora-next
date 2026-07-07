# Carga de pedidos por voz (Admin > Nuevo pedido)

Estado: **implementado y en produccion**. Este documento existe porque una IA anterior, al ver un nombre de diseño dictado por voz con un número pegado (ej. "Argentina 1"), asumió sin verificar que era un artefacto de reconocimiento de voz — y no lo era: **"Argentina 1" es (o puede ser) el nombre real de un diseño en el catálogo**, porque este negocio numera variantes de diseños. Leer este archivo antes de tocar el código o de diagnosticar un reporte de bug en esta función, para no repetir ese error.

Desde 2026-07-07 hay **dos motores de reconocimiento de voz en paralelo, para comparar** (ver sección "Segundo motor: Vosk" más abajo): el botón de la izquierda usa la Web Speech API (nativa del navegador, lo único que existía antes); el botón de la derecha ("V", violeta) usa **Vosk corriendo en el propio dispositivo** (WebAssembly, sin depender de ningún servicio de Android ni de un servidor). Los dos alimentan exactamente el mismo parser (`parseVoiceFull`) y el mismo formulario — la única diferencia real entre ambos botones es cómo se captura/transcribe el audio.

Contexto general del repo: leer primero `AGENTS.md` (protocolo) y `CONTEXT.md` (contexto estable del proyecto).

## Regla número uno antes de diagnosticar cualquier bug acá

**Un nombre de diseño "raro" dictado por voz (con números, palabras sueltas, etc.) no es necesariamente un bug de transcripción.** El matching es contra los nombres reales de la tabla `designs` (via `fuzzyMatchDesigns`, threshold `IMPORT_MATCH_THRESHOLD = 0.68` en `components/CreateOrderModal.js`). Antes de asumir que algo es "ruido del micrófono":

1. Buscar si existe un diseño con ese nombre exacto o similar en el catálogo (tabla `designs`, o via el buscador del tab Diseños en `/admin`).
2. Si existe un diseño real que matchea, el comportamiento es correcto — no hay nada que arreglar.
3. Solo si el texto dictado no corresponde a ningún diseño real y además es un patrón de repetición/crecimiento (ver más abajo) hay que sospechar de un bug de transcripción.

## Archivos involucrados

- **`lib/voice-order-parser.js`** — funciones puras, sin dependencias de React ni del navegador. Fácil de probar aisladas con `node -e`. Contiene:
  - `parseVoiceSegment(text)` — separa "`<nombre> por <cantidad>`" usando el ÚLTIMO " por " del texto (para tolerar nombres de diseño que ya contengan la palabra "por").
  - `parseQtyWord(text)` — cantidad dictada: dígitos directos (`"10"`) o palabras numéricas en español, incluyendo compuestas ("treinta y dos" = 30+2 = 32). Si no reconoce ninguna palabra, devuelve `null` y el caller cae a cantidad 1.
  - `parseSpanishDate` / `parseSpanishTime` / `parseDateTimeValue` — fechas y horas dictadas en español, con varios formatos tolerados ("2 de julio del 2026", "2 de julio 2026", "16 y media", "4 de la tarde", etc.).
  - `parseVoiceFull(text, buffer)` — el parser principal: recibe el texto ya acumulado (buffer sin flushear + nuevo texto) y devuelve `{ items, remaining }`. Reconoce comandos de namespace (ver abajo) y separa segmentos por las palabras de corte (`NEXT_WORDS`).
- **`components/CreateOrderModal.js`** — todo el estado de React, el wiring de `SpeechRecognition` (Web Speech API) y la aplicación de los `items` parseados sobre el formulario (fuzzy match de diseños/vendedor/operario/cliente, fechas, notas).

## Gramática de voz (namespaces y comandos)

El diseño de la gramática usa **namespace primero, verbo después** (no al revés):

- **Micrófono**: `"microfono cerrar"` / `"voz parar"` / etc. (palabra de `MIC_NS` seguida de palabra de `MIC_STOP`) → detiene la grabación. Decir solo `"cerrar"` sin la palabra de namespace antes NO lo detiene (se trata como texto normal).
- **Pedido**: `"pedido guardar"` / `"pedido confirmar"` / `"pedido enviar"` → guarda el pedido. `"pedido cancelar"` / `"pedido cerrar"` → cierra sin guardar. `"pedido borrar"` / `"pedido limpiar"` / `"pedido vaciar"` → pide confirmación para vaciar el formulario.
- **Avance de segmento**: decir cualquiera de `siguiente`, `proximo`, `sigue`, `next`, `guardar`, `continuar` (sueltas, sin namespace) cierra el segmento actual (diseño o campo) y empieza uno nuevo. Ojo: `"guardar"` SOLO (sin `"pedido"` antes) es equivalente a "siguiente", NO guarda el pedido — para guardar el pedido hace falta decir `"pedido guardar"`.

## Campos reconocidos al empezar un segmento

Ver `FIELD_RULES` en `lib/voice-order-parser.js`. Los triggers se buscan solo al **principio** del segmento (no en cualquier posición), y las reglas multi-palabra están ordenadas antes que las de una sola palabra para que "fecha entrega" no quede capturado por la regla más corta de "fecha" sola:

- `fecha` / `fecha del pedido` → fecha del pedido.
- `fecha entrega` / `entrega` / `entregar` / `para entregar` → fecha de entrega.
- `hora` / `horario` → hora (se aplica al último campo de fecha usado, `date` o `deliveryDate`, guardado en `voiceLastDateFieldRef`).
- `cliente` / `clientes` / `comprador(a)` / `para el cliente` → nombre del cliente (con fuzzy match contra clientes ya conocidos, `recentOrders`).
- `vendedor(a/es/as)` / `vende` → vendedor (fuzzy match contra `sellers`).
- `operador(a/es/as)` / `operario(s)` → operario (fuzzy match contra `operators`).
- `nota(s)` / `observacion(es)` / `comentario(s)` / `aclaracion(es)` → notas.
- Si el segmento no matchea ningún campo, se trata como un **diseño** (`"<nombre> por <cantidad>"`).

## Cómo se cargan los diseños

`addVoiceRow` en `CreateOrderModal.js` toma el texto del segmento, lo separa en nombre+cantidad (`parseVoiceSegment`), y busca coincidencia contra los diseños reales (`fuzzyMatchDesigns`, filtrados a los que tienen PDF si corresponde). Si el score es `>= 0.68` se linkea al diseño real (con su miniatura); si no, queda como fila "manual" (texto libre, sin vincular) con un badge de "sugerido" (`suggested: true`) para que el admin lo revise a mano.

## Limitaciones de plataforma conocidas (no corregibles desde este código)

- **El micrófono suena/parpadea cada ~5 segundos en Android.** Aunque el código configura `rec.continuous = true`, Android/Chrome no lo respeta del todo y corta la sesión de reconocimiento sola cada pocos segundos por su propio detector de actividad de voz interno. El código ya reinicia automáticamente lo más rápido posible (`rec.onend` → nuevo `createRecognition()` con ~150ms de espera) para minimizar pérdida de audio, pero el sonido de "inicio de escucha" lo dispara el propio sistema operativo al invocar `.start()`, y no hay ningún parámetro del Web Speech API para silenciarlo desde la página. **No intentar "arreglar" esto de nuevo sin evidencia de una causa distinta** — ya se investigó (turno 2026-07-07).
- **Cada reinicio del mic puede re-finalizar el mismo tramo de audio, creciendo palabra por palabra** (ej. "Argentina" → "Argentina 1" → "Argentina 1 por" → "Argentina 1 por 10" como resultados finales separados, en vez de mandar solo la palabra nueva cada vez). Esto SÍ se corrigió: `processVoiceFinal` en `CreateOrderModal.js` compara cada resultado final contra el anterior (`lastFinalRef`) y, si el nuevo empieza con el anterior, se queda solo con la cola nueva (`raw.slice(last.text.length)`) en vez de concatenar todo de nuevo. Si el nuevo es idéntico al anterior (dentro de 8 segundos), se descarta entero. **Esto no afecta contenido dictado legítimamente distinto** (como un "1" que sea parte real de un nombre de diseño) — solo colapsa crecimiento/repetición literal del mismo string.

## Robustez de cierre por voz (closures de React)

`createRecognition()` arma los callbacks de `SpeechRecognition` una sola vez al iniciar o reanudar la grabación, y quedan vivos mientras el mic sigue grabando sin pausas (incluso a través de los reinicios automáticos por el punto anterior, porque `rec.onend` se re-invoca a sí mismo dentro del mismo closure). Eso significa que cualquier función usada ahí adentro que lea `rows`/`customerName`/`date`/etc. **directo de las variables de estado de React** (no de un `ref`) quedaría con datos viejos, de cuando arrancó la grabación — no con lo que se fue dictando en esa misma sesión.

Por eso `handleSave` y `handleClose` (los comandos "pedido guardar"/"pedido cancelar") se invocan a través de `handleSaveRef.current()` / `handleCloseRef.current()`, refs que se actualizan en un `useEffect` sin dependencias (corre después de cada render, igual que `designsRef`/`knownCustomerNamesRef` que ya existían para lo mismo). **Cualquier función nueva que se dispare desde un comando de voz debe seguir este mismo patrón** (ref actualizado por efecto, no la función capturada directo del closure), o va a heredar el mismo bug.

## Segundo motor: Vosk (en el dispositivo, botón "V" a la derecha)

Se agregó un segundo motor para poder comparar contra la Web Speech API en el mismo formulario. Motivación: en Android, la Web Speech API depende del servicio nativo de reconocimiento de voz, que reinicia solo cada pocos segundos (ver limitación de arriba) y eso genera el beep repetido. Vosk corre **enteramente en el navegador vía WebAssembly** (librería `vosk-browser`, npm), sin invocar ningún servicio de reconocimiento del sistema operativo — captura el audio crudo con `getUserMedia`/`AudioContext` y lo transcribe localmente, así que en teoría no debería tener ese problema de reinicios/beep. Esto todavía no está confirmado con una prueba real en un celular — es justamente lo que este botón permite probar.

### Piezas nuevas

- **Dependencia**: `vosk-browser` (`package.json`). Se importa con `await import('vosk-browser')` de forma perezosa DENTRO de `startVosk()` — nunca en el top-level del archivo — para que su bundle (~5.7MB, incluye el WASM de Kaldi embebido) NO se cargue en el chunk principal del admin. Confirmado con el build: la ruta `/admin` casi no cambió de tamaño (+1KB) porque webpack lo separa en un chunk aparte que solo se pide cuando el usuario aprieta el botón.
- **Modelo de español**: `public/models/vosk-model-small-es-0.42.tar.gz` (~38MB, modelo liviano oficial de [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models), licencia Apache 2.0). Se sirve como archivo estático de Next.js en `/models/vosk-model-small-es-0.42.tar.gz`. **Importante sobre el formato**: `vosk-browser` exige que el `.tar.gz` tenga una carpeta de nivel superior llamada exactamente `model/` (no `vosk-model-small-es-0.42/`, que es como viene el `.zip` original de alphacephei) — hay que renombrar la carpeta antes de re-empaquetar. Si en el futuro hay que actualizar/cambiar de modelo, repetir: descargar el `.zip`, descomprimir, `mv <carpeta-original> model`, `tar -czf nuevo-nombre.tar.gz model`.
- **`components/CreateOrderModal.js`**: nuevas funciones `loadVoskModel` (carga y cachea el modelo en `voskModelRef`, una sola vez por sesión del modal), `startVosk`/`stopVosk`/`stopVoskInternal` (arman/desarman el pipeline de audio: `getUserMedia` → `AudioContext` → `ScriptProcessorNode` → `recognizer.acceptWaveform()`), y estado paralelo (`voskState`, `voskError`, refs `voskModelRef`/`voskRecognizerRef`/`voskAudioCtxRef`/`voskStreamRef`/`voskNodesRef`).
- **El `ScriptProcessorNode` se conecta a través de un `GainNode` con volumen 0 antes de `audioContext.destination`**, no directo. Es necesario para que `onaudioprocess` se dispare de forma confiable (el nodo necesita estar conectado hasta el destino final del grafo de audio), pero conectarlo directo haría que el propio micrófono se escuche por los parlantes (eco/feedback) — el gain en 0 lo deja mudo.

### Cómo se comparte todo lo demás con la Web Speech API

Los resultados finales de Vosk (evento `result` del `KaldiRecognizer`) se mandan al **mismo** `processVoiceFinal(text)` que ya usaba la Web Speech API — mismo parser, mismo log de "Dictado", mismo matching de diseños, mismos comandos de voz ("pedido guardar", etc.). Así la comparación entre los dos botones es solo sobre la calidad/comportamiento de la transcripción, no sobre dos implementaciones distintas del resto del formulario.

Como los comandos de voz ("pedido guardar"/"cancelar"/"cerrar") necesitan saber CUÁL de los dos motores hay que detener, se agregó `activeEngineRef` (`'webspeech'` | `'vosk'` | `null`) y un helper `stopActiveEngine()` que reemplaza las llamadas directas a `stopRecognition()` que había antes dentro de `processVoiceFinal`. Cualquier motor nuevo que se agregue en el futuro debe registrarse ahí también.

Los dos botones **se deshabilitan mutuamente** mientras el otro está grabando (no tiene sentido ni es seguro correr ambos pipelines de audio a la vez sobre el mismo micrófono).

### Pendiente de esta primera versión (a propósito, para no sobre-invertir antes de ver si vale la pena)

- No tiene pausa/reanudar (solo iniciar/detener) — la Web Speech API sí la tiene.
- No se probó todavía en un dispositivo Android real (ni en desktop) — se armó, se verificó que compila y que el chunk se separa correctamente, pero falta la prueba end-to-end con micrófono real.
- El modelo se recarga (fetch + init WASM) cada vez que se abre el modal de nuevo, porque `voskModelRef` se limpia al desmontar. Si el tiempo de carga molesta en el uso real, se puede mover el caché a un nivel más arriba (fuera del modal) para que persista mientras dure la sesión de la pestaña.

## Historial de fixes relevantes

Ver `AI_RUN_LOG.md`, entradas del 2026-07-07 (19:15 y 20:19) para el detalle turno a turno de los bugs corregidos: closure obsoleto en guardar/cancelar, año perdido en fechas sin conector "del"/"de", cantidades compuestas ("treinta y dos"), y transcripción creciente/duplicada en Android. La entrada más reciente (Vosk) tiene su propio detalle de implementación arriba.
