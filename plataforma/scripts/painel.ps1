# Dark Kitchen Studio - painel na bandeja do sistema para ligar/desligar a producao.
# Usa os arquivos iniciar-producao.bat e parar-producao.bat da raiz. Somente ASCII.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$raiz = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

$form = New-Object Windows.Forms.Form
$form.Text = 'Dark Kitchen - Servidor'
$form.Size = New-Object Drawing.Size(460, 340)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [Drawing.Color]::FromArgb(13, 13, 13)
$form.ForeColor = [Drawing.Color]::White
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false

function Botao($texto, $x) {
  $b = New-Object Windows.Forms.Button
  $b.Text = $texto; $b.Location = New-Object Drawing.Point($x, 12); $b.Size = New-Object Drawing.Size(130, 34)
  $b.FlatStyle = 'Flat'; $b.BackColor = [Drawing.Color]::FromArgb(150, 26, 29)
  $form.Controls.Add($b); $b
}
$btIniciar = Botao 'Iniciar' 12
$btParar = Botao 'Parar' 152

$log = New-Object Windows.Forms.TextBox
$log.Multiline = $true; $log.ReadOnly = $true; $log.ScrollBars = 'Vertical'
$log.Location = New-Object Drawing.Point(12, 58); $log.Size = New-Object Drawing.Size(420, 230)
$log.BackColor = [Drawing.Color]::FromArgb(25, 25, 25); $log.ForeColor = [Drawing.Color]::Gainsboro
$form.Controls.Add($log)

$tray = New-Object Windows.Forms.NotifyIcon
$tray.Icon = [Drawing.SystemIcons]::Application
$tray.Text = 'Dark Kitchen - Servidor'
$tray.Visible = $true
$menu = New-Object Windows.Forms.ContextMenuStrip
$tray.ContextMenuStrip = $menu

$script:sair = $false
function Mostrar { $form.Show(); $form.WindowState = 'Normal'; $form.Activate() }

function Rodar($bat) {
  $btIniciar.Enabled = $false; $btParar.Enabled = $false
  $log.AppendText("`r`n> $bat`r`n")
  $p = New-Object Diagnostics.Process
  $p.StartInfo.FileName = 'cmd.exe'
  $p.StartInfo.Arguments = "/c `"$(Join-Path $raiz $bat)`" < nul"
  $p.StartInfo.UseShellExecute = $false; $p.StartInfo.CreateNoWindow = $true
  $p.StartInfo.RedirectStandardOutput = $true; $p.StartInfo.RedirectStandardError = $true
  $p.Start() | Out-Null
  while (-not $p.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
  $saida = ($p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()) -split "`r?`n" |
    Where-Object { $_ -and $_ -notmatch 'timeout|ERRO: redirecionamento|ERROR: Input redirection|fecha sozinha' }
  $log.AppendText(($saida -join "`r`n") + "`r`n")
  $btIniciar.Enabled = $true; $btParar.Enabled = $true
  $tray.ShowBalloonTip(3000, 'Dark Kitchen', ($saida | Select-Object -Last 1), 'Info')
}

$btIniciar.Add_Click({ Rodar 'iniciar-producao.bat' })
$btParar.Add_Click({ Rodar 'parar-producao.bat' })
$menu.Items.Add('Abrir', $null, { Mostrar }) | Out-Null
$menu.Items.Add('Iniciar', $null, { Rodar 'iniciar-producao.bat' }) | Out-Null
$menu.Items.Add('Parar', $null, { Rodar 'parar-producao.bat' }) | Out-Null
$menu.Items.Add('-') | Out-Null
$menu.Items.Add('Sair (servidor continua ligado)', $null, { $script:sair = $true; $form.Close() }) | Out-Null
$menu.Items.Add('Parar servidor e sair', $null, { Rodar 'parar-producao.bat'; $script:sair = $true; $form.Close() }) | Out-Null
$tray.Add_DoubleClick({ Mostrar })

# Fechar ou minimizar manda para a bandeja
$form.Add_FormClosing({ if (-not $script:sair) { $_.Cancel = $true; $form.Hide() } })
$form.Add_Resize({ if ($form.WindowState -eq 'Minimized') { $form.Hide() } })
$form.Add_Shown({ Rodar 'iniciar-producao.bat' })

[Windows.Forms.Application]::Run($form)
$tray.Visible = $false; $tray.Dispose()
