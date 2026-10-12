@echo off
rem Dark Kitchen Studio - DESLIGA o servidor de DESENVOLVIMENTO (http://localhost:3000).
rem Dois cliques neste arquivo no computador de trabalho. Fecha tambem o servidor que ficou
rem rodando em segundo plano (sem janela).
rem Na maquina servidor (producao), use o parar-producao.bat.
chcp 65001 >nul
title Dark Kitchen Studio - desligando o servidor de desenvolvimento
cd /d "%~dp0plataforma"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "if (Get-ScheduledTask -TaskName 'Dark Kitchen - Servidor' -ErrorAction SilentlyContinue) { Write-Host 'Esta e a maquina servidor: use o parar-producao.bat.' -ForegroundColor Yellow; exit };" ^
  "$pasta = (Get-Location).Path + '\node_modules\next';" ^
  "$procs = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($pasta) };" ^
  "if (-not $procs) { Write-Host 'O servidor de desenvolvimento ja esta desligado.' -ForegroundColor Green; exit };" ^
  "foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Start-Sleep -Seconds 2;" ^
  "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { Write-Host 'Algo ainda esta usando a porta 3000 (talvez outro programa).' -ForegroundColor Red } else { Write-Host 'Servidor de desenvolvimento desligado.' -ForegroundColor Green }"

echo.
echo Esta janela fecha sozinha em 10 segundos.
timeout /t 10 >nul
