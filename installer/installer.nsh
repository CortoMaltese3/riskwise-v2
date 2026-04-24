!include "FileFunc.nsh"
!include "LogicLib.nsh"

; Force immediate detail pane updates
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_UNFINISHPAGE_NOAUTOCLOSE

!macro customInit
  SetDetailsPrint both
!macroend

!macro customHeader
  ShowInstDetails show
!macroend

; The RISK WISE engine is no longer downloaded during install. The app
; fetches the signed engine-manifest.json on first launch and downloads
; the engine from `manifest.download_url` into
; `%LOCALAPPDATA%\RiskWiseEngine` (see `downloadAndInstallEngine` in
; `public/electron.js` and DECISIONS.md D15). The offline installer
; variant bundles the engine via `extraResources` instead (see
; `electron-builder.config.js`), so no installer-time download is
; required in either variant.

!macro customInstall
  DetailPrint "=========================================="
  DetailPrint "Installing RISK WISE Application"
  DetailPrint "=========================================="
  DetailPrint ""
  Sleep 500

  DetailPrint "Installing application files..."
  Sleep 500
  DetailPrint "Application files installed"
  DetailPrint ""
  Sleep 300

  DetailPrint "Finalizing installation..."
  Sleep 500
  DetailPrint "Installation complete"
  DetailPrint ""
  DetailPrint "The RISK WISE engine will be downloaded on first launch."
  DetailPrint "=========================================="
  Sleep 500
!macroend
