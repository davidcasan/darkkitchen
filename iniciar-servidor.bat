@echo off
chcp 65001 >nul
title Dark Kitchen Studio - servidor
cd /d "%~dp0plataforma"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo O servidor ja esta rodando. Abrindo o navegador...
  start "" http://localhost:3000
  timeout /t 3 >nul
  exit /b 0
)

if not exist node_modules (
  echo Instalando dependencias na primeira vez, aguarde...
  call npm install
)

echo Iniciando o servidor da Dark Kitchen Studio...
echo O navegador abre sozinho em alguns segundos: http://localhost:3000
echo Para desligar o servidor, feche esta janela ou aperte Ctrl+C.
echo.

rem Abre o navegador depois de 8 segundos, sem travar o servidor.
start "" /b cmd /c "timeout /t 8 >nul & start "" http://localhost:3000"

call npm run dev

echo.
echo O servidor parou.
pause
