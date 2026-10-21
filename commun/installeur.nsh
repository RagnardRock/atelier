; Ajouts à l'installeur Windows (NSIS) de Skald, Brokk et Tafl : package.json › build › nsis › include.
;
; Pourquoi : avant d'installer une nouvelle version, l'installeur lance l'ancien désinstalleur, qui
; déplace un par un les fichiers de l'ancienne version. Si un seul fichier est encore tenu ouvert par
; un programme, il s'arrête (code 2) et l'installeur affichait « Échec de désinstallation des anciens
; fichiers d'application : 2 », puis abandonnait.
;
; 1. customCheckAppRunning remplace la recherche de l'outil ouvert d'electron-builder (PowerShell, qui
;    compare le chemin de chaque programme au dossier d'installation). Ici, plus simple : on ferme tout
;    ce qui s'appelle <Outil>.exe dans ta session Windows, avec ses sous-programmes (/T : Claude Code et
;    le serveur MCP de l'Atelier, qui est une copie de l'outil lancée en mode Node).
; 2. customUnInstallCheck : si l'ancien désinstalleur échoue quand même, c'est qu'un AUTRE programme
;    tient un fichier. On demande à Windows lequel (commun/bloqueurs.ps1), on te le montre, on le ferme
;    et on réessaie, au lieu du « : 2 » sans explication.

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

; Quels programmes bloquent encore des fichiers du dossier de l'outil ? (commun/bloqueurs.ps1)
; Les montre et propose de les fermer (fermés d'office en mode silencieux, comme l'outil lui-même).
; Sortie : $R1 = 1 si des programmes ont été fermés (on peut réessayer), 0 sinon.
; Seulement dans l'installeur (le désinstalleur est fabriqué à part et ne s'en sert pas).
!ifndef BUILD_UNINSTALLER
Function atelierDebloquer
  InitPluginsDir
  File "/oname=$PLUGINSDIR\bloqueurs.ps1" "${PROJECT_DIR}\..\commun\bloqueurs.ps1"
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\bloqueurs.ps1" -Dossier "$INSTDIR"`
  Pop $R1
  Pop $R2
  StrCmp $R1 "1" 0 aucun
  DetailPrint "Fichiers de ${PRODUCT_NAME} bloqués par : $R2"
  MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Ces programmes gardent des fichiers de ${PRODUCT_NAME} ouverts, la mise à jour ne peut pas les remplacer :$\r$\n$\r$\n$R2$\r$\nOK : les fermer et continuer. Annuler : arrêter la mise à jour." /SD IDOK IDOK fermer
  StrCpy $R1 0
  Return
  fermer:
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\bloqueurs.ps1" -Dossier "$INSTDIR" -Fermer`
  Pop $R2
  Sleep 1500
  StrCpy $R1 1
  Return
  aucun:
  StrCpy $R1 0
FunctionEnd
!endif

; Appelé par electron-builder après l'ancien désinstalleur ($R0 = son code, 0 = réussi).
; S'il a échoué : on cherche qui bloque, on le ferme, on relance le désinstalleur (3 fois au plus).
; Si ça échoue encore, même fin qu'avant (message d'erreur, installation arrêtée) : surtout pas
; d'installation par-dessus, qui laisserait un mélange de l'ancienne et de la nouvelle version.
!macro customUnInstallCheck
  ClearErrors
  StrCpy $R3 0
  ${While} $R0 != 0
  ${AndIf} $R3 < 3
    IntOp $R3 $R3 + 1
    Call atelierDebloquer
    ${If} $R1 == 0
      ${ExitWhile}
    ${EndIf}
    Push $rootKey_uninstallResult
    Call uninstallOldVersion
    ClearErrors
  ${EndWhile}
  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend
