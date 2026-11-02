# Dark Kitchen Studio - corrige tudo que aponta para a pasta antiga da instalacao.
# Rodar como Administrador no servidor, depois de mover a pasta. Somente ASCII.
# Uso: powershell -ExecutionPolicy Bypass -File mudar-pasta.ps1 [-Velho C:\darkkitchen] [-Novo C:\CASACASERVER\darkkitchen]
param([string]$Velho = 'C:\darkkitchen', [string]$Novo = 'C:\CASACASERVER\darkkitchen')

# Tarefas do Agendador
foreach ($n in 'Dark Kitchen - Servidor', 'Dark Kitchen - Backup', 'Dark Kitchen - Painel') {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if (-not $t) { Write-Host "$n : nao existe" -ForegroundColor Yellow; continue }
  foreach ($a in $t.Actions) {
    $a.Arguments = $a.Arguments.Replace($Velho, $Novo)
    if ($a.WorkingDirectory) { $a.WorkingDirectory = $a.WorkingDirectory.Replace($Velho, $Novo) }
  }
  Set-ScheduledTask -TaskName $n -Action $t.Actions | Out-Null
  Write-Host "$n -> $((Get-ScheduledTask -TaskName $n).Actions.Arguments)"
}

# Servico do Caddy
$k = 'HKLM:\SYSTEM\CurrentControlSet\Services\DarkKitchenCaddy'
Set-ItemProperty $k ImagePath ((Get-ItemProperty $k).ImagePath.Replace($Velho, $Novo))
Write-Host "Caddy -> $((Get-ItemProperty $k).ImagePath)"

# Firewall 80/443 (liberado so para o caddy.exe)
Get-NetFirewallRule | Where-Object DisplayName -like 'Dark Kitchen*(Caddy)*' | ForEach-Object {
  $_ | Get-NetFirewallApplicationFilter | Set-NetFirewallApplicationFilter -Program "$Novo\caddy\caddy.exe"
  Write-Host "$($_.DisplayName) -> $(($_ | Get-NetFirewallApplicationFilter).Program)"
}

# Pasta do backup no .env.local
$env = "$Novo\projeto\plataforma\.env.local"
$txt = [IO.File]::ReadAllText($env)
[IO.File]::WriteAllText($env, $txt.Replace("BACKUP_DESTINO=$Velho", "BACKUP_DESTINO=$Novo"))
Select-String -Path $env -Pattern 'BACKUP_DESTINO' | ForEach-Object { Write-Host $_.Line }

Write-Host 'Pronto. Abra o painel-servidor.bat de novo.' -ForegroundColor Green
