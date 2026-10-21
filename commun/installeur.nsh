; Ajouts à l'installeur Windows (NSIS) de Skald, Brokk et Tafl : package.json › build › nsis › include.
;
; Pourquoi : avant d'installer une nouvelle version, l'installeur lance l'ancien désinstalleur, qui
; déplace un par un les fichiers de l'ancienne version. Si un seul fichier est encore tenu ouvert par
; un programme, il s'arrête (code 2) et l'installeur affichait « Échec de désinstallation des anciens
; fichiers d'application : 2 », puis abandonnait.
;
; 1. customCheckAppRunning remplace la recherche de l'outil ouvert d'electron-builder. Celle-ci passe
;    par PowerShell et compare le chemin de chaque programme au dossier d'installation : elle rate les
;    programmes dont Windows ne donne pas le chemin, et les copies de l'outil lancées en mode Node par
;    Claude Code (le serveur MCP de l'Atelier). Ici on ferme tout ce qui s'appelle <Outil>.exe pour ta
;    session Windows, avec ses sous-programmes (/T : Claude Code et son serveur MCP compris).
; 2. customUnInstallCheck / customUnInstallCheckCurrentUser : si l'ancien désinstalleur échoue quand
;    même (un autre programme tient un fichier), on ne s'arrête plus. Il a remis l'ancienne version en
;    place ; on installe la nouvelle par-dessus. Si un fichier est vraiment bloqué, l'installeur le dit
;    alors avec son chemin (et propose Réessayer), au lieu d'un « : 2 » sans explication.

!macro atelierTrouverOutil _RETOUR
  nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
  Pop ${_RETOUR}
!macroend

!macro atelierFermerOutil
  ; D'abord poliment (l'outil peut finir d'écrire ses réglages), puis de force avec les sous-programmes.
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  Sleep 1500
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  ; Windows relâche les fichiers d'un programme arrêté un peu après.
  Sleep 1000
!macroend

!macro customCheckAppRunning
  !insertmacro atelierTrouverOutil $R0
  ${if} $R0 == 0
    ${if} ${isUpdated}
      ; Mise à jour lancée par l'outil lui-même : il est en train de se fermer, on lui laisse une seconde.
      Sleep 1000
    ${else}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK +2
      Quit
    ${endIf}
    DetailPrint "$(appClosing)"
    ${Do}
      !insertmacro atelierFermerOutil
      !insertmacro atelierTrouverOutil $R0
      ${if} $R0 != 0
        ${ExitDo}
      ${endIf}
      ; Encore là (lancé en administrateur ?) : on demande de le fermer à la main.
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY +2
      Quit
    ${Loop}
  ${endIf}
!macroend

!macro customUnInstallCheck
  ClearErrors
  ${if} $R0 != 0
    DetailPrint "L'ancienne version n'a pas pu être retirée (code $R0) : la nouvelle est installée par-dessus."
  ${endIf}
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend
