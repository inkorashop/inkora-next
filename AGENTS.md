# Protocolo de trabajo para IAs

Este proyecto puede ser editado por mas de una IA, principalmente ChatGPT Codex y Claude Code, pero no al mismo tiempo. El objetivo de este archivo es que cualquier IA pueda retomar el trabajo sin perder contexto ni pisar cambios previos.

## Archivo de entrada unico

El usuario solo necesita recordar y pedir la lectura de `AGENTS.md`.

Si una IA recibe una instruccion como "lee AGENTS.md y segui desde ahi", debe hacer este arranque obligatorio antes de modificar cualquier cosa:

1. Leer este `AGENTS.md` completo.
2. Leer `CONTEXT.md` para entender el contexto estable del proyecto, stack, deploy, seguridad y reglas operativas.
3. Leer `AI_RUN_LOG.md` para revisar que hizo la IA anterior.
4. Ejecutar o revisar `git status --short` para ver el estado real del arbol de trabajo.
5. Auditar la ultima entrada relevante de `AI_RUN_LOG.md` contra el estado actual del repo.
6. Trabajar en la tarea pedida por el usuario.
7. Al terminar el turno de trabajo, agregar una entrada nueva arriba de todo en `AI_RUN_LOG.md`.

Prompt corto recomendado para el usuario:

`Lee AGENTS.md y segui el protocolo del proyecto. Tarea: ...`

## Nombre del ciclo de trabajo

Para este proyecto, un "turno de trabajo" es cada ciclo que empieza con un prompt del usuario y termina cuando la IA entrega su respuesta final. No significa una sesion completa de tokens ni cada edicion individual de codigo.

La bitacora se actualiza al terminar cada turno de trabajo en el que se hizo trabajo sobre el proyecto.

## Archivos que hay que leer al empezar

Antes de modificar codigo, SQL, configuracion o documentacion del proyecto, leer:

1. `AGENTS.md` - archivo de entrada unico y protocolo de colaboracion entre IAs.
2. `CONTEXT.md` - contexto estable del producto, stack, deploy, seguridad y reglas operativas.
3. `AI_RUN_LOG.md` - ultimas actualizaciones por turno de trabajo.
4. `git status --short` - estado real del arbol de trabajo.

Si el trabajo toca una zona especifica, leer tambien los archivos cercanos antes de editar.

## Auditoria al retomar

Al comenzar un turno de trabajo, revisar la ultima entrada relevante de `AI_RUN_LOG.md` y contrastarla con el estado real del repo.

La auditoria debe ser proporcional al cambio:

- Si la entrada anterior dice que se editaron archivos, revisar esos archivos o el diff.
- Si dice que se corrio un build/test, no asumirlo como verdad absoluta; usarlo como pista.
- Si hay cambios sin commitear de otra IA o del usuario, no revertirlos.
- Si se detecta un problema introducido por una IA anterior, avisar al usuario o corregirlo si esta dentro del pedido actual.

## Como cerrar un turno de trabajo

Al terminar un turno de trabajo, agregar una entrada nueva arriba de todo en `AI_RUN_LOG.md`.

Usar hora local `America/Buenos_Aires` con formato:

`YYYY-MM-DD HH:mm -03:00`

La entrada debe ser breve y util. Incluir:

- IA: `ChatGPT Codex` o `Claude Code`.
- Objetivo: que pidio el usuario.
- Cambios: resumen de archivos tocados.
- Verificacion: comandos ejecutados o motivo por el que no se ejecutaron.
- Auditoria: que se reviso del turno anterior o del estado previo.
- Pendiente/Riesgos: lo que queda por hacer, dudas o riesgos.

## Reglas de colaboracion

- No trabajar dos IAs en paralelo sobre el mismo arbol de trabajo.
- Antes de editar, revisar `git status --short`.
- No sobrescribir cambios ajenos sin pedir permiso.
- Mantener cambios acotados al pedido del usuario.
- No commitear, pushear ni desplegar salvo que el usuario lo pida o que la regla operativa del proyecto lo requiera y el usuario no haya indicado lo contrario.
- Si hay SQL, coordinar o ejecutar primero el script correspondiente en Supabase antes del deploy.
- No subir ni pegar secretos, `.env`, dumps, backups o claves.
- No exponer claves `service_role` en frontend.

## Relacion entre archivos

- `AGENTS.md` es el archivo de entrada unico para el usuario y contiene el protocolo de trabajo para IAs.
- `CONTEXT.md` contiene informacion estable del proyecto.
- `AI_RUN_LOG.md` contiene la bitacora cronologica resumida.
- `CLAUDE.md` apunta a `AGENTS.md` para que Claude Code encuentre el flujo completo facilmente.
