# Instalação no servidor (Windows)

Passo a passo para rodar a plataforma Dark Kitchen Studio numa máquina Windows como servidor.
Os comandos são para o **PowerShell**. Onde estiver escrito "como Administrador", abra o
PowerShell com o botão direito → **Executar como administrador**.

## 1. Programas

Como Administrador:

```powershell
winget install --id Git.Git -e
winget install --id Cloudflare.cloudflared -e
```

**Node.js 24** (a mesma versão do desenvolvimento; a plataforma usa o banco SQLite que vem
dentro do Node): baixe o instalador **v24.x** (Windows Installer .msi, 64-bit) em
<https://nodejs.org/en/download/archive/v24> e instale com as opções padrão.

Feche e abra o PowerShell de novo. Confira: `node -v` deve mostrar `v24.x`.

## 2. Projeto

```powershell
git clone https://github.com/davidcasan/darkkitchen.git "E:\Vibecoding\Dark Kitchen Studio"
cd "E:\Vibecoding\Dark Kitchen Studio\plataforma"
npm ci
```

(Se a máquina não tiver o disco E:, use outro caminho; o resto funciona igual.)

## 3. Configuração e dados

1. **Configuração:** copie `plataforma\.env.exemplo` para `plataforma\.env.local` e preencha
   (endereço, admin inicial, senha do e-mail, pasta do backup). Ou traga o `.env.local` da
   máquina antiga e acrescente `APP_URL`, `ADMIN_*` e `BACKUP_*`.
2. **Dados — decisão de out/2026: recomeçar do zero só nos clientes.** Copie a pasta
   `plataforma\data` da máquina antiga (**com o servidor de lá desligado**) e, na máquina nova,
   apague os clientes e tudo o que é deles (pedidos, créditos, faturas, marcas, arquivos,
   conversas), mantendo os admins, os preços e planos, o Pix e as estatísticas de visitas:

   ```powershell
   node scripts\limpar-clientes.mjs              # só mostra o que vai apagar
   node scripts\limpar-clientes.mjs --confirmar  # faz backup do banco e apaga
   ```

   (Sem copiar a pasta `data`, a plataforma começa vazia de tudo, só com o admin do
   `.env.local`, e os preços e o Pix precisam ser refeitos nas telas.)

Em produção, as contas de teste (`@teste.com`) são desativadas sozinhas.

## 4. Compilar

```powershell
npm run build
```

## 5. Deixar o Windows pronto para servidor

- **Energia:** Configurações → Sistema → Energia → "Suspender" e "Desligar tela" em **Nunca**
  (a tela pode desligar; o computador não pode suspender).
- **Atualizações:** Windows Update → Opções avançadas → **Horário ativo** cobrindo o dia todo,
  para o Windows não reiniciar no meio do expediente.
- **OneDrive/Google Drive** (se o backup for para lá): o aplicativo precisa estar instalado e
  com o usuário conectado, senão as cópias ficam só no disco local.

## 6. Servidor e backup automáticos

Como Administrador, na pasta `plataforma`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar-servico.ps1
```

Isso cria duas tarefas no Agendador de Tarefas do Windows:

| Tarefa | O que faz |
|---|---|
| Dark Kitchen - Servidor | Sobe com o Windows (mesmo sem login) e reinicia se cair |
| Dark Kitchen - Backup | Todo dia às 3h: cópia do banco e dos arquivos para `BACKUP_DESTINO` |

Teste em alguns segundos: <http://localhost:3000>. O servidor só atende nesta máquina
(endereço 127.0.0.1); o acesso de fora é pelo túnel do Cloudflare (passo 7).

Registro (log) do servidor: `plataforma\logs\servidor-AAAA-MM-DD.log`.

## 7. Endereço na internet (Cloudflare Tunnel)

Pré-requisito: o domínio `darkkitchen.art.br` administrado pelo Cloudflare (DNS), com os
registros de e-mail da UOL copiados antes da troca (MX `mx.uhserver.com` e o SPF).

```powershell
cloudflared tunnel login                       # abre o navegador para autorizar
cloudflared tunnel create darkkitchen
cloudflared tunnel route dns darkkitchen app.darkkitchen.art.br
```

Crie `C:\Users\<usuário>\.cloudflared\config.yml`:

```yaml
tunnel: darkkitchen
credentials-file: C:\Users\<usuário>\.cloudflared\<ID-do-túnel>.json
ingress:
  - hostname: app.darkkitchen.art.br
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Instale como serviço (como Administrador): `cloudflared service install`.
Confira o `APP_URL=https://app.darkkitchen.art.br` no `.env.local` e rode o passo 8
(atualizar) para recompilar com o endereço.

## 8. Atualizar para uma versão nova

Depois de um commit novo no GitHub, na pasta `plataforma`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\atualizar.ps1
```

Faz backup, para o servidor, baixa o código, instala, compila e sobe de novo.

## Backup: conferir e restaurar

- Conferir: `BACKUP_DESTINO\backup.log` tem uma linha por dia ("OK" ou "ERRO"). Backup à mão:
  `npm run backup`.
- Restaurar:
  1. Pare o servidor: `powershell -ExecutionPolicy Bypass -File scripts\parar.ps1`
     (só parar a tarefa agendada não basta: os processos que ela abriu continuam rodando).
  2. Em `plataforma\data`, apague `dark-kitchen.db`, `dark-kitchen.db-wal` e `dark-kitchen.db-shm`.
  3. Copie a cópia escolhida de `BACKUP_DESTINO\banco\` para `plataforma\data\dark-kitchen.db`.
  4. Copie `BACKUP_DESTINO\arquivos\` para `plataforma\data\arquivos\`.
  5. Suba de novo: `Start-ScheduledTask "Dark Kitchen - Servidor"`.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Página não abre | Veja o log em `plataforma\logs`; confira se a tarefa "Dark Kitchen - Servidor" está "Em execução" |
| "Não há nenhum admin ativo" no log | Preencha `ADMIN_EMAIL` e `ADMIN_SENHA_INICIAL` (10+ caracteres) no `.env.local` e reinicie |
| Formulários não funcionam pelo endereço novo | `APP_URL` errado ou faltou recompilar (passo 8) |
| E-mails não saem | Tela **Acessos** → quadro E-mails mostra o último erro; confira `SMTP_*` no `.env.local` |
| "Muitas tentativas seguidas" no login | Espere 15 minutos (proteção contra adivinhação de senha) |
