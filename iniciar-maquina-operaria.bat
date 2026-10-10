@echo off
rem Dark Kitchen Studio - MAQUINA OPERARIA da IA Comp.
rem Rode no computador que tem o After Effects. Ele busca no site os pedidos que estao
rem aguardando, monta a composicao no After (sem abrir a interface) e devolve o .aep.
rem So trabalha com o After FECHADO. Para parar: feche esta janela.
rem Precisa de IA_COMP_SERVIDOR e IA_COMP_TOKEN_MAQUINA no plataforma\.env.local.
title Dark Kitchen - Maquina operaria (IA Comp)
cd /d "%~dp0plataforma"
node scripts\maquina-operaria.mjs
pause
