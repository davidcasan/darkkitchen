@echo off
rem Dark Kitchen Studio - DESLIGA a plataforma no servidor e o Caddy (HTTPS).
rem Dois cliques neste arquivo na maquina servidor. Pede permissao de administrador.
rem Depois disso, quem acessar darkkitchen.art.br vera erro de conexao.

net session >nul 2>&1
if errorlevel 1 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title Dark Kitchen Studio - desligando
echo Desligando o HTTPS e a plataforma...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Service DarkKitchenCaddy -ErrorAction SilentlyContinue; Write-Host ('Caddy (HTTPS): ' + (Get-Service DarkKitchenCaddy).Status)"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0plataforma\scripts\parar.ps1"
echo.
echo Esta janela fecha sozinha em 15 segundos.
timeout /t 15 >nul
