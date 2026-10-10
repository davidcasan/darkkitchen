# Dark Kitchen Studio - registra as tarefas do Windows (rodar UMA vez, como Administrador):
#   1. "Dark Kitchen - Servidor": roda a plataforma em segundo plano (mesmo sem ninguem
#      logado) e reinicia sozinha se cair. Por padrao NAO sobe com o Windows (decisao do
#      dono, out/2026): liga-se pelo iniciar-producao.bat ou com
#      Start-ScheduledTask "Dark Kitchen - Servidor". Para subir junto com o Windows, use
#      o parametro -IniciarComWindows.
#   2. "Dark Kitchen - Backup": copia o banco e os arquivos todo dia as 3h.
# As duas rodam com o usuario atual, sem guardar senha (tipo de logon S4U).
#
# Uso (PowerShell como Administrador, na pasta plataforma):
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-servico.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-servico.ps1 -IniciarComWindows

#Requires -RunAsAdministrator
param([switch]$IniciarComWindows)
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js nao encontrado. Instale o Node.js 24 e abra um novo PowerShell." }
if (-not (Test-Path (Join-Path $raiz ".next\BUILD_ID"))) { throw "Falta compilar: rode 'npm run build' na pasta plataforma antes." }
if (-not (Test-Path (Join-Path $raiz ".env.local"))) { throw "Falta o arquivo plataforma\.env.local (configuracao e senhas)." }

# Identidade real do usuario (via SSH, $env:USERDOMAIN vem como "WORKGROUP" e nao serve).
$usuario = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$quem = New-ScheduledTaskPrincipal -UserId $usuario -LogonType S4U -RunLevel Limited

# Servidor: se cair, a propria tarefa tenta de novo a cada minuto.
$servidor = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$raiz\scripts\producao.ps1`"" `
  -WorkingDirectory $raiz
$regrasServidor = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$extras = @{}
if ($IniciarComWindows) { $extras.Trigger = New-ScheduledTaskTrigger -AtStartup }
Register-ScheduledTask -TaskName "Dark Kitchen - Servidor" -Action $servidor @extras `
  -Principal $quem -Settings $regrasServidor -Description "Plataforma Dark Kitchen Studio (Next.js, modo producao)" -Force | Out-Null

# Backup: todo dia as 3h (se o computador estiver desligado, roda quando ligar).
$backup = New-ScheduledTaskAction -Execute $node -Argument "`"$raiz\scripts\backup.mjs`"" -WorkingDirectory $raiz
$regrasBackup = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName "Dark Kitchen - Backup" -Action $backup -Trigger (New-ScheduledTaskTrigger -Daily -At 3am) `
  -Principal $quem -Settings $regrasBackup -Description "Backup diario do banco e dos arquivos da Dark Kitchen Studio" -Force | Out-Null

Start-ScheduledTask -TaskName "Dark Kitchen - Servidor"
Write-Host "Pronto. Servidor iniciado e backup diario agendado (3h)."
if (-not $IniciarComWindows) { Write-Host "Ao reiniciar o Windows, ligue de novo pelo iniciar-producao.bat." }
Write-Host "Teste em alguns segundos: http://localhost:3000"
Write-Host "Registro (log) do servidor: $raiz\logs"
