!include "FileFunc.nsh"
!include "LogicLib.nsh"

!macro _DownloadAndInstallEngine
  ; $0 = engine dir, $1 = python dir, $2 = archive in TEMP
  StrCpy $0 "$LOCALAPPDATA\RiskWiseEngine"
  StrCpy $1 "$0"
  StrCpy $2 "$TEMP\RiskWiseEngine.zip"

  DetailPrint "Checking for existing RISK WISE engine in $1"
  IfFileExists "$1\python.exe" 0 +3
    DetailPrint "Engine already installed, skipping download and extraction."
    Goto done_engine

  ; Ensure engine dir is clean (python missing => safe to wipe)
  DetailPrint "Preparing engine directory: $0"
  RMDir /r "$0"
  CreateDirectory "$0"

  ; If archive already exists in TEMP, reuse it
  ${If} ${FileExists} "$2"
    DetailPrint "Found existing engine archive at $2, skipping download."
  ${Else}
    DetailPrint "Engine archive not found, downloading..."
    StrCpy $3 "https://github.com/gkalomalos/ERA-Project_RISK-WISE/releases/download/v1.0.6/RiskWiseEngine.zip"

    nsExec::ExecToLog 'curl -L "$3" --output "$2"'
    Pop $4

    ${If} $4 != 0
      MessageBox MB_ICONSTOP \
        "Failed to download engine archive.$\r$\nExit code: $4$\rURL: $3"
      Goto done_engine
    ${EndIf}
  ${EndIf}

  ; Sanity check archive
  ${IfNot} ${FileExists} "$2"
    MessageBox MB_ICONSTOP \
      "Engine archive missing after download:$\r$2"
    Goto done_engine
  ${EndIf}

  ; Extract with tar (Win10+ tar supports .zip)
  DetailPrint "Extracting engine archive to $0..."
  nsExec::ExecToStack 'tar -xf "$2" -C "$0"'
  Pop $4
  Pop $5
  DetailPrint "tar output: $5"

  ${If} $4 != 0
    MessageBox MB_ICONSTOP \
      "Failed to extract engine archive.$\r$\nExit code: $4$\rSource: $2$\rDestination: $0$\rOutput:$\r$5"
    Goto done_engine
  ${EndIf}

  ; Only delete archive on successful extract
  DetailPrint "Cleaning up engine archive..."
  Delete "$2"

  ; Final sanity check
  DetailPrint "Verifying engine python at $1\python.exe"
  IfFileExists "$1\python.exe" 0 +3
    DetailPrint "RISK WISE engine installed to $1"
    Goto done_engine

  DetailPrint "Engine extracted but python.exe was not found in $1"
  MessageBox MB_ICONSTOP \
    "Engine archive extracted, but python.exe was not found in:$\r$1"

done_engine:
!macroend

!macro customHeader
  ShowInstDetails show
!macroend

!macro customInstall
  !insertmacro _DownloadAndInstallEngine
!macroend
