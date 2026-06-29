# INKORA Print Bridge - Diagnostico local

Este proyecto es el prototipo diagnostico inicial del puente local de impresion.

En esta etapa no imprime trabajos reales. Sirve para:

- listar impresoras instaladas en Windows;
- detectar una impresora cuyo nombre contenga `L8050`;
- abrir las preferencias del driver con `printui.dll`;
- leer el `DEVMODE` default del driver con `DocumentProperties`;
- ver estado basico del spooler;
- exponer una API local de solo lectura en `http://127.0.0.1:17389`;
- autorizar carpetas locales de PDFs y escanearlas;
- guardar logs locales.

## Requisitos

- Windows.
- .NET 8 SDK.

## Ejecutar

```powershell
dotnet run --project bridge\Inkora.PrintBridge\Inkora.PrintBridge.csproj
```

Desde la carpeta del proyecto tambien se puede usar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File bridge\Inkora.PrintBridge\start-bridge.ps1
```

Si el SDK .NET 8 todavia no esta instalado, se puede abrir un preview temporal con:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File bridge\Inkora.PrintBridge\run-diagnostic-preview.ps1
```

Los logs quedan en:

```text
%LOCALAPPDATA%\INKORA\PrintBridge\logs\bridge-diagnostic.log
```

## API local

El Bridge escucha solo en loopback:

```text
http://127.0.0.1:17389
```

Endpoints iniciales:

- `GET /health`: publico, permite detectar si el Bridge esta abierto.
- `GET /printers`: requiere header `X-Inkora-Bridge-Token`.
- `GET /devmode?printer=...`: requiere token y lee el `DEVMODE` de la impresora.
- `POST /driver/open-preferences?printer=...`: requiere token y abre preferencias del driver.
- `GET /pdf-roots`: requiere token y lista carpetas autorizadas.
- `POST /pdf-roots/add-dialog`: requiere token y abre el selector local de carpeta.
- `POST /pdf-scan`: requiere token y escanea PDFs.
- `POST /design-pdfs/match`: requiere token y busca PDFs por diseño.

El token se genera localmente y se puede copiar desde la ventana del Bridge.
