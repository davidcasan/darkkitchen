# Dark Kitchen Studio - roda o servidor em modo producao e reinicia se ele parar.
# Usado pela tarefa agendada "Dark Kitchen - Servidor" (instalar-servico.ps1).
# Registro (log) diario em plataforma\logs\servidor-AAAA-MM-DD.log, guardado por 30 dias.

$ErrorActionPreference = "Continue"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$logs = Join-Path $raiz "logs"
New-Item -ItemType Directory -Force $logs | Out-Null

while ($true) {
  $log = Join-Path $logs ("servidor-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
  Add-Content $log -Encoding UTF8 ("{0} Iniciando o servidor" -f (Get-Date -Format "s"))
  # Via cmd para o registro sair em texto comum (o redirecionamento do PowerShell 5 grava em UTF-16).
  & cmd.exe /c "npm run producao >> `"$log`" 2>&1"
  Add-Content $log -Encoding UTF8 ("{0} O servidor parou (codigo {1}). Reiniciando em 10 segundos." -f (Get-Date -Format "s"), $LASTEXITCODE)
  Get-ChildItem $logs -Filter "servidor-*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
  Start-Sleep -Seconds 10
}
