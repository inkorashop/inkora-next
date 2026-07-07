' Lanza el programita de backups de Inkora: arranca el servidor local (oculto,
' sin ventana de consola) y despues abre una ventanita tipo app (sin barra de
' direcciones ni pestañas) apuntando a esa pagina.
'
' Uso normal (doble clic / acceso directo):        launch.vbs
' Uso automatico (desde la tarea programada 3 AM):  launch.vbs autorun

Option Explicit

Dim shell, fso, scriptDir, projectRoot, appDir, nodeExe, browserExe, autorunArg, url, args
Dim candidates, i

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))
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

' ── Arrancar el servidor local, oculto ────────────────────────────────────────
shell.CurrentDirectory = appDir
shell.Run """" & nodeExe & """ server.js", 0, False

WScript.Sleep 1000

' ── Abrir la ventana ──────────────────────────────────────────────────────────
If browserExe <> "" Then
  args = "--app=" & url & " --window-size=420,660 --window-position=200,120"
  shell.Run """" & browserExe & """ " & args, 1, False
Else
  ' No se encontro Edge ni Chrome: al menos abrir en el navegador por defecto
  shell.Run url, 1, False
End If
