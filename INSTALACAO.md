# Instalação no servidor (Windows)

Passo a passo para rodar a plataforma Dark Kitchen Studio numa máquina Windows como servidor.
Os comandos são para o **PowerShell**. Onde estiver escrito "como Administrador", abra o
PowerShell com o botão direito → **Executar como administrador**.

## 1. Programas

Como Administrador:

```powershell
winget install --id Git.Git -e
```

(Por SSH o winget falha; nesse caso, instale o Git pelo instalador de
<https://git-scm.com/download/win> com `/VERYSILENT /NORESTART`.)

**Node.js 24** (a mesma versão do desenvolvimento; a plataforma usa o banco SQLite que vem
dentro do Node): baixe o instalador **v24.x** (Windows Installer .msi, 64-bit) em
<https://nodejs.org/en/download/archive/v24> e instale com as opções padrão.

Feche e abra o PowerShell de novo. Confira: `node -v` deve mostrar `v24.x`.

## 2. Projeto

```powershell
mkdir C:\darkkitchen\bkp
git clone https://github.com/davidcasan/darkkitchen.git C:\darkkitchen\projeto
cd C:\darkkitchen\projeto\plataforma
npm ci
```

(No servidor atual: projeto em `C:\darkkitchen\projeto`, backup em `C:\darkkitchen\bkp`,
Caddy em `C:\darkkitchen\caddy`.)

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
| Dark Kitchen - Servidor | Roda a plataforma em segundo plano (mesmo sem login) e reinicia se cair. **Não sobe sozinha com o Windows** (decisão do dono): ligue pelo `iniciar-producao.bat`. Para subir com o Windows, instale com `-IniciarComWindows` |
| Dark Kitchen - Backup | Todo dia às 3h: cópia do banco e dos arquivos para `BACKUP_DESTINO` |

**Ligar e desligar** (na raiz do projeto, dois cliques; pedem permissão de administrador):
`iniciar-producao.bat` liga a plataforma e o Caddy; `parar-producao.bat` desliga os dois.
Pelo PowerShell (como Administrador):
`Start-ScheduledTask "Dark Kitchen - Servidor"; Start-Service DarkKitchenCaddy` para ligar,
e `powershell -ExecutionPolicy Bypass -File plataforma\scripts\parar.ps1; Stop-Service DarkKitchenCaddy`
para desligar. **Depois de reiniciar o Windows, o site fica fora do ar até alguém ligar.**

Teste em alguns segundos: <http://localhost:3000>. O servidor só atende nesta máquina
(endereço 127.0.0.1); o acesso de fora é pelo Caddy (passo 7).

Registro (log) do servidor: `plataforma\logs\servidor-AAAA-MM-DD.log`.

## 7. Endereço na internet (conexão direta + Caddy)

Decisão de out/2026: **sem Cloudflare**. O domínio aponta direto para o IP público da casa, e o
**Caddy** (em `C:\darkkitchen\caddy`) recebe as visitas nas portas 80/443, gera e renova o
HTTPS sozinho (Let's Encrypt) e repassa para a plataforma (127.0.0.1:3000).

1. **Caddy:** baixe o `caddy.exe` (Windows amd64) em
   <https://github.com/caddyserver/caddy/releases>, confira o SHA-512 com o `checksums.txt` e
   coloque em `C:\darkkitchen\caddy\`. Copie `plataforma\scripts\Caddyfile` para a mesma pasta.
   Como Administrador: `powershell -ExecutionPolicy Bypass -File scripts\instalar-caddy.ps1`
   (serviço "Dark Kitchen - Caddy (HTTPS)", conta LocalService, **manual e parado**; firewall
   das portas 80/443 só para o Caddy).
2. **Do lado do dono:**
   - IP público **fixo**, com as portas 80/443 de entrada **liberadas** pela operadora;
   - no roteador: **redirecionar as portas 80 e 443** para o IP local do servidor e **reservar
     esse IP** (reserva de DHCP);
   - no painel da UOL Host: **registro A** `darkkitchen.art.br` e `www` → IP público, removendo
     o redirecionamento antigo (**não mexer** nos registros MX/SPF do e-mail).
3. **Ligar**, só depois do passo 2 (senão o Let's Encrypt bloqueia por tentativas falhas):
   `iniciar-producao.bat` (ou `Start-Service DarkKitchenCaddy`). O serviço do Caddy fica em
   modo **manual**, como a plataforma. Confira `C:\darkkitchen\caddy\logs` e abra
   <https://darkkitchen.art.br>.

Nunca redirecione no roteador a porta do SSH nem a 3000.

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
