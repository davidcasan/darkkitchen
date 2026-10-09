# Dark Kitchen Studio - para o servidor por completo (o laco do producao.ps1 e tudo o que ele
# abriu: cmd, npm, node). So parar a tarefa agendada nao basta: os processos filhos continuam.
#
# Uso (PowerShell como Administrador, na pasta plataforma):
#   powershell -ExecutionPolicy Bypass -File scripts\parar.ps1
# Para subir de novo: Start-ScheduledTask "Dark Kitchen - Servidor"

Stop-ScheduledTask -TaskName "Dark Kitchen - Servidor" -ErrorAction SilentlyContinue
$lacos = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "powershell.exe" -and $_.CommandLine -match "producao\.ps1" }
foreach ($l in $lacos) { & taskkill.exe /PID $l.ProcessId /T /F | Out-Null }
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "Atencao: ainda ha algo na porta 3000."
} else {
  Write-Host "Servidor parado."
}
