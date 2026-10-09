# Dark Kitchen Studio - instala uma versao nova (depois de um commit no GitHub):
# faz backup, para o servidor, baixa o codigo, instala dependencias, compila e sobe de novo.
#
# Uso (PowerShell na pasta plataforma):
#   powershell -ExecutionPolicy Bypass -File scripts\atualizar.ps1

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

Write-Host "1/5 Backup antes de atualizar..."
& node scripts\backup.mjs
if ($LASTEXITCODE -ne 0) { throw "O backup falhou. Nada foi alterado." }

Write-Host "2/5 Parando o servidor..."
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "parar.ps1")

try {
  Write-Host "3/5 Baixando a versao nova do GitHub..."
  & git -C (Split-Path -Parent $raiz) pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw "git pull falhou (alteracoes locais na pasta?)." }

  Write-Host "4/5 Instalando dependencias e compilando..."
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci falhou." }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "A compilacao falhou." }
}
finally {
  Write-Host "5/5 Subindo o servidor..."
  Start-ScheduledTask -TaskName "Dark Kitchen - Servidor"
}
Write-Host "Pronto. Confira em alguns segundos: http://localhost:3000"
