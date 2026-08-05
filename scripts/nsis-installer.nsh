; LogicNest WorkHub NSIS hooks.
;
; The upstream installer hook contained product-specific migration logic,
; recursive cleanup and Defender exclusions. Those operations are not part of
; the first LogicNest release and are intentionally absent here. electron-
; builder owns the normal install, shortcut, uninstall and app-data policy.
; Keeping these hooks minimal also means a clean install never elevates or
; changes Windows Defender configuration.

!macro customHeader
  ; The electron-builder configuration requests asInvoker. Do not add a
  ; Do not add an elevation override here.
!macroend

!macro customInit
  DetailPrint "LogicNest WorkHub installer initialized"
!macroend

!macro customCheckAppRunning
  ; electron-builder performs its standard process check.
!macroend

!macro customBeforeRegistryAddInstallInfo
  ; No legacy product registry migration is performed in the first release.
!macroend

!macro customInstall
  DetailPrint "LogicNest WorkHub installed"
!macroend

!macro customUnInstall
  DetailPrint "LogicNest WorkHub uninstall requested"
!macroend
