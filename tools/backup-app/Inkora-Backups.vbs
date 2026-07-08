' Lanza el panel de backups de Inkora: arranca el servidor local (oculto, sin
' ventana de consola) y despues abre una ventanita tipo app (sin barra de
' direcciones ni pestañas), del tamaño de un cuarto de la pantalla.
'
' Uso normal (doble clic / acceso directo):        Inkora-Backups.vbs
' Uso automatico (desde la tarea programada):       Inkora-Backups.vbs autorun

Option Explicit

Dim shell, fso, scriptDir, appDir, nodeExe, browserExe, autorunArg, url, args
Dim candidates, i, winWidth, winHeight, winLeft, winTop

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = scriptDir

' ── Ubicar node.exe ──────────────────────────────────────────────────────────
nodeExe = "C:\Program Files\nodejs\node.exe"
If Not fso.FileExists(nodeExe) Then nodeExe = "node" ' ultimo recurso: confiar en PATH

' ── Ubicar un navegador con soporte --app (Edge o Chrome) ────────────────────
candidates = Array( _
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", _
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe", _
  "C:\Program Files\Google\Chrome\Application\chrome.exe", _
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
browserExe = ""
For i = 0 To UBound(candidates)
  If fso.FileExists(candidates(i)) Then
    browserExe = candidates(i)
    Exit For
  End If
Next

autorunArg = ""
If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "autorun" Then autorunArg = "?autorun=1"
End If

url = "http://localhost:4173/" & autorunArg

' Tamaño de arranque de respaldo (el propio app.js la redimensiona a 1/4 de la
' pantalla real apenas carga, via window.resizeTo/moveTo — mas rapido y
' confiable que consultar la resolucion por WMI, que puede llegar a colgarse
' en maquinas virtuales/sesiones remotas).
winWidth = 960 : winHeight = 540
winLeft = 200 : winTop = 120

' ── Arrancar el servidor local, oculto ────────────────────────────────────────
shell.CurrentDirectory = appDir
shell.Run """" & nodeExe & """ server.js", 0, False

WScript.Sleep 1000

' ── Abrir la ventana ──────────────────────────────────────────────────────────
If browserExe <> "" Then
  args = "--app=" & url & " --window-size=" & winWidth & "," & winHeight & " --window-position=" & winLeft & "," & winTop
  shell.Run """" & browserExe & """ " & args, 1, False
Else
  ' No se encontro Edge ni Chrome: al menos abrir en el navegador por defecto
  shell.Run url, 1, False
End If
