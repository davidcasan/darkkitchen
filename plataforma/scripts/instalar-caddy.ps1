# Dark Kitchen Studio - registra o Caddy (HTTPS) como servico do Windows. Rodar UMA vez,
# como Administrador, com o caddy.exe e o Caddyfile ja em C:\darkkitchen\caddy.
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-caddy.ps1
# O servico fica MANUAL e parado: ligue quando o dominio e o roteador estiverem prontos com
#   Set-Service DarkKitchenCaddy -StartupType Automatic; Start-Service DarkKitchenCaddy
# (ligar antes faz o Caddy pedir certificado sem conseguir, e o Let's Encrypt bloqueia por um tempo).

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$pasta = "C:\darkkitchen\caddy"
$caddy = Join-Path $pasta "caddy.exe"
$config = Join-Path $pasta "Caddyfile"
if (-not (Test-Path $caddy)) { throw "Falta $caddy" }
if (-not (Test-Path $config)) { throw "Falta $config" }

# Conta de servico com permissao minima (LocalService) pode escrever so na pasta do Caddy.
& icacls.exe $pasta /grant "*S-1-5-19:(OI)(CI)M" /T /Q | Out-Null

if (-not (Get-Service DarkKitchenCaddy -ErrorAction SilentlyContinue)) {
  New-Service -Name DarkKitchenCaddy -DisplayName "Dark Kitchen - Caddy (HTTPS)" `
    -Description "HTTPS e entrada da internet para a plataforma Dark Kitchen Studio" `
    -BinaryPathName "`"$caddy`" run --config `"$config`" --adapter caddyfile" -StartupType Manual | Out-Null
}
$servico = Get-CimInstance Win32_Service | Where-Object Name -eq "DarkKitchenCaddy"
$r = Invoke-CimMethod -InputObject $servico -MethodName Change -Arguments @{ StartName = "NT AUTHORITY\LocalService"; StartPassword = "" }
if ($r.ReturnValue -ne 0) { throw "Nao consegui trocar a conta do servico (codigo $($r.ReturnValue))." }
& sc.exe failure DarkKitchenCaddy reset= 86400 actions= restart/5000/restart/30000/restart/60000 | Out-Null

# Portas 80 e 443 so para o Caddy.
foreach ($p in 80, 443) {
  if (-not (Get-NetFirewallRule -Name "DarkKitchen-HTTP-$p" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name "DarkKitchen-HTTP-$p" -DisplayName "Dark Kitchen - porta $p (Caddy)" -Direction Inbound `
      -Protocol TCP -LocalPort $p -Action Allow -Profile Any -Program $caddy | Out-Null
  }
}
Get-Service DarkKitchenCaddy | Select-Object Name, Status, StartType
