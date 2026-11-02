@echo off
rem Dark Kitchen Studio - painel na bandeja: liga ao abrir, botoes Iniciar/Parar.
rem Abre pela tarefa "Dark Kitchen - Painel" (ja tem permissao de administrador, sem aviso do Windows).
rem Para criar a tarefa (uma vez so): plataforma\scripts\instalar-painel.ps1 como administrador.
schtasks /run /tn "Dark Kitchen - Painel" >nul 2>&1
if not errorlevel 1 exit /b
rem Sem a tarefa: pede administrador do jeito normal.
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0plataforma\scripts\painel.ps1"
