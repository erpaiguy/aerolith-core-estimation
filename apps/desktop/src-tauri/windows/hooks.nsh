; Keep the running app from blocking an upgrade.
; The installed product was Estimation.exe; Bid Craft.exe is the current name.
!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'taskkill /F /IM "Estimation.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Bid Craft.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "${MAINBINARYNAME}.exe"'
  Sleep 500
!macroend
