@echo off
rem Dark Kitchen Studio - LIGA a plataforma no servidor (modo producao) e o Caddy (HTTPS).
rem Dois cliques neste arquivo na maquina servidor. Pede permissao de administrador.
rem (Para desenvolvimento, no computador de trabalho, use o iniciar-servidor.bat.)

net session >nul 2>&1
if errorlevel 1 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title Dark Kitchen Studio - ligando
echo Ligando a plataforma e o HTTPS...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-ScheduledTask -TaskName 'Dark Kitchen - Servidor';" ^
  "Start-Service DarkKitchenCaddy;" ^
  "$ok = $false; for ($i = 0; $i -lt 30 -and -not $ok; $i++) { Start-Sleep -Seconds 2; try { $ok = (Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch {} };" ^
  "if ($ok) { Write-Host 'Pronto: https://darkkitchen.art.br esta no ar.' -ForegroundColor Green } else { Write-Host 'A plataforma nao respondeu em 60 segundos. Veja o registro em plataforma\logs.' -ForegroundColor Red };" ^
  "Write-Host ('Caddy (HTTPS): ' + (Get-Service DarkKitchenCaddy).Status)"
echo.
echo Esta janela fecha sozinha em 15 segundos.
timeout /t 15 >nul
