# Dark Kitchen Studio - cria a tarefa "Dark Kitchen - Painel" (uma vez so, como administrador).
# Depois disso o painel-servidor.bat abre o painel ja como administrador, sem aviso do Windows.
# A tarefa nao tem gatilho: so roda quando alguem abre o painel. Somente ASCII.
$painel = Join-Path $PSScriptRoot 'painel.ps1'
$usuario = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$painel`""
$quem = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Highest
$conf = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Dark Kitchen - Painel' -Action $acao -Principal $quem -Settings $conf -Force | Out-Null
Write-Host "Tarefa 'Dark Kitchen - Painel' criada para $usuario." -ForegroundColor Green
