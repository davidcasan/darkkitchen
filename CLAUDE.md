# Projeto: Dark Kitchen Studio — plataforma de motion graphics sob demanda

Contexto trazido de uma conversa no claude.ai (out/2026). Nome definido: **Dark Kitchen Studio** (antes "Quadro"); o app fica na pasta `plataforma/`.

## Conceito
Plataforma online brasileira onde empresas pedem peças de motion graphics por um formulário de briefing e recebem a peça pronta, tudo online. Referências: Vidsy (internacional), Motion Brand e Motion Blink (Brasil).

**Decisão:** produção 100% humana. A ideia de integrar agentes de IA (triagem, prompts, Higgsfield) foi descartada.

## Modelo de negócio
- O cliente compra **entregas**, não horas. Escopo já embalado por tipo de peça (duração, prazo, nº de revisões).
- Cobrança por **créditos**, somente via planos mensais (a compra avulsa foi descartada em out/2026).
- Fontes de margem: diferença entre preço do crédito e custo de produção; créditos não usados; reaproveitamento de templates e arquivos da marca; receita recorrente; upsell (créditos extras, adicionais); adaptações de formato baratas de produzir.
- Fluxo: briefing estruturado → triagem (diretor de arte) → designer da rede (núcleo fixo + freelancers) → controle de qualidade (diretor de arte) → entrega e revisões → arquivos salvos no perfil da marca.

## Identidade visual (out/2026)
Conceito: "dark kitchen" de motion graphics, sem salão, da cozinha direto pro cliente; cozinha de churrasco, brasa, vermelho e preto. Referência: Suno (escuro, tipografia forte, simples e sofisticado).
- Interface só no escuro. Tokens em `plataforma/src/app/globals.css`: fundo 95% preto (`--bg` #0d0d0d), brasa (`--accent` #ff4d2e → `--accent-2` #ff8a3d, degradê `--grad-brasa`), âmbar `--key` #ffb547. Texto sobre brasa é escuro (`--on-accent`) por contraste.
- Fontes: Sora (títulos) e Manrope (texto). Logo (out/2026, arquivo original do dono): "DARK" + seta vermelha (`--logo-vermelho` #961a1d) / "KITCHEN", branco, em duas linhas (`src/components/Marca.tsx`, texto + SVG). A fonte original do logo é Articulat CF Heavy (paga, não instalada); hoje o texto usa Sora 800. Ícone da aba: seta vermelha em `src/app/icon.svg`. A chama antiga foi removida.
- Vocabulário de cozinha só em detalhes (Cardápio, Da comanda à entrega), sem sacrificar clareza.
- Códigos de pedido: `DK-1001`, `DK-1002`… (os antigos `Q-` são convertidos pela migração em `db.ts`).

## Escopo da plataforma (definido out/2026)
Sistema web rodando em servidor, com três áreas:
1. **Site público:** página inicial com serviços, benefícios e chamada para contratar; login de cliente e de artista.
2. **Área do cliente:** assinatura, saldo e histórico de créditos, formas de pagamento, novo pedido (briefing), pedidos anteriores e status de cada um.
3. **Área do artista/equipe:** acesso aos briefings gerados pelos pedidos, troca de informações entre as equipes.

**Plataformas:** precisa funcionar igualmente bem no navegador de computador e no do celular (responsivo). Alvo inicial: Chrome e Firefox no Windows. Um app mobile nativo fica para o futuro, mas a arquitetura já deve facilitar essa transição (ex.: API separada da interface).

**Créditos:** os valores no protótipo são simbólicos, usados só como experiência. A precificação abaixo ainda não é definitiva.

**Decisões (out/2026):**
- Hospedagem: por enquanto na máquina local (Windows); depois um serviço online. Atenção: hospedagem compartilhada comum (ex.: GoDaddy básico) não roda Node.js — será preciso VPS ou serviço com suporte a Node.
- Equipe de desenvolvimento: só o dono do projeto + Claude. Preferir soluções simples e com poucas dependências.
- Atendimento (out/2026, constantes em `src/domain/contato.ts`): **contato@darkkitchen.art.br** para quem ainda não é cliente (contratação); clientes usam o **chat do atendimento** dentro da plataforma (o e-mail sac@darkkitchen.art.br fica guardado para uso futuro). O contato@ aparece no rodapé e nas dúvidas do site.
- Chat do atendimento (SAC, out/2026, `services/atendimento.ts`, API `/api/v1/atendimento`): entre o cliente e o **admin** (designer e diretor não participam). Uma conversa por pedido (`pedido_id`) e uma geral por cliente (`pedido_id` NULL, ex.: compra de créditos adicionais, que o admin lança em Contas). Ninguém edita mensagens (gatilho no banco recusa UPDATE). Só o **admin apaga** uma mensagem ou a conversa inteira (botões no chat; API DELETE), com as imagens do disco; cada exclusão fica em `atendimento_exclusoes`. Mensagens aceitam **imagem PNG, JPG ou BMP até 2 MB** (tipo conferido pelos primeiros bytes; colunas `imagem_*`; arquivo em `data/arquivos/atendimento/`; servida por `/api/v1/atendimento/imagem/[id]` só para o cliente da conversa e o admin); dá para colar imagem no campo. Leitura por pessoa em `atendimento_leituras`. Cliente: botão flutuante "Atendimento" em todas as páginas (no pedido abre a conversa do pedido; fora, a geral), atualização a cada 4s com o chat aberto. Admin: página `/equipe/atendimento` (lista + conversa, contador de não lidas no menu), botão no pedido e na conta do cliente. Avisos por notificação interna (um por sequência de mensagens em 15 min); `?chat=1` no link abre o chat. Marcadores como no Telegram: relógio (enviando), ✓ enviada, ✓✓ verde lida (mensagem do cliente: lida quando algum admin leu; do admin: quando o cliente leu; a API devolve `lidaAte`). Ler mensagens atualiza os contadores da página (`router.refresh`).
- Uma conta por usuário; cada usuário é responsável pelos próprios jobs (sem várias pessoas por marca).
- Ordem de construção: começar pelo que tem menor risco.

## Código
App em `plataforma/` — Next.js 16 (App Router, TypeScript), CSS Modules + tokens em `src/app/globals.css` e componentes visuais em `src/app/ui.css`. O Next 16 tem APIs novas: consultar `plataforma/node_modules/next/dist/docs/` antes de usar algo. `cacheComponents` está desligado de propósito (áreas logadas são dinâmicas).
- `src/domain/` — regras puras, sem banco nem tela: catálogo/planos, briefing (cálculo de créditos, validação por etapa), máquina de estados do pedido (`ACOES`, `podeExecutar`). Usado no navegador, no servidor e pelo futuro app.
- `src/server/` — `db.ts` (SQLite nativo `node:sqlite`, arquivo `data/dark-kitchen.db`; só esta camada muda para ir a PostgreSQL), `auth.ts` (sessão por token: cookie httpOnly no navegador, `Bearer` na API), `services/*` (toda regra de negócio), `seed.ts` (dados de teste criados ao subir com banco vazio, via `src/instrumentation.ts`).
- `src/app/(site)/` site público · `src/app/cliente/` área do cliente · `src/app/equipe/` área da equipe · `src/app/actions/` Server Actions · `src/app/api/v1/` API REST (login, me, pedidos, créditos, upload/download de arquivos com Range).
- Pagamento: `services/pagamentos.ts` tem a interface `Gateway`; hoje é simulado (aprova na hora). Para cobrar de verdade, implementar Asaas/Pagar.me e trocar a constante `GATEWAY`.
- **Contratação só por Pix (decisão out/2026):** o pagamento com cartão está **oculto e desligado** por enquanto (`CARTAO_ATIVO = false` em `services/pagamentos.ts`). Cadastro, Conta e cobranças (assinatura, renovação, upgrade, Personalizado) usam só Pix/QR Code, inclusive para quem tinha cartão cadastrado. O cartão será implementado no futuro com um gateway real (Asaas, Pagar.me): implementar o `Gateway` e trocar `CARTAO_ATIVO` para true; o código do cartão simulado continua lá.
- **Pix (out/2026):** recebedor configurado (CNPJ 12.009.865/0001-06, nome no QR "CARLOS DAVID DOS SANTOS", São Paulo). Pix é real, com QR Code estático no padrão do Banco Central (`domain/pix.ts`, CRC conferido com o exemplo oficial; imagem pela biblioteca `qrcode`). Chave, nome e cidade do recebedor ficam em `configuracoes` (chave `pix`), editáveis em `/equipe/pagamentos`; sem configuração, a opção Pix não aparece. Toda cobrança pela forma padrão do cliente passa por `pagar()` em `services/assinaturas.ts`: cartão cobra e libera na hora; Pix cria fatura `pendente` com `pix_payload`, `vence_em` (3 dias) e `acao` (JSON: ativar, renovar ou upgrade), e **nada é liberado até o admin confirmar** em Pagamentos (`confirmarPagamento` aplica a ação). O cliente pode avisar "Já paguei". Renovação por Pix: gera a cobrança do mês e entra em carência (`inadimplente_desde`, sem `proxima_tentativa`); sem confirmação em 3 dias, encerra e cancela a cobrança.
- **Conta pendente** (`assinaturas.status = 'pendente'`): cadastro com Pix (aguardando o 1º pagamento) ou com o plano **Personalizado** (sem pagamento; negociação pelo chat). A área do cliente mostra só `AreaPendente` (cobrança Pix, se houver, chat embutido e sair). O admin define créditos/valor na conta do cliente; com Pix, isso gera o QR para o cliente e os créditos entram na confirmação.
- Arquivos enviados ficam em `plataforma/data/arquivos` (fora do git).
- Marcas: cada cliente tem várias marcas (`marcas`, `services/marcas.ts`), cada uma com logo, manual, cores e observações (`arquivos.marca_id`). Todo pedido pertence a uma marca (`pedidos.marca_id`); no briefing, a etapa Marca pergunta "para qual marca" (existente ou nova, criada ali mesmo). Logo e manual do pedido precisam ser da marca escolhida. Páginas `/cliente/marcas` e `/cliente/marcas/[id]`.
- Preços (admin, `/equipe/precos`): o admin define o **valor-base do crédito (R$)**, os custos de produção, prazos/revisões, urgência e os planos (criar, ocultar; com assinantes não remove). Os créditos de cada atividade são CALCULADOS: créditos = custo ÷ (1 − impostos − meta de margem) ÷ valor do crédito, arredondado para cima (`tabelaCreditos` em `domain/precos.ts`); locução e roteiro são repasses com valor em R$ por duração (roteiro: até 30s / até 90s; locução: 30/60/90s) e usam a margem sobre repasses; peças têm preço por faixa de duração; revisão extra = custo do retrabalho. Não existe compra avulsa de créditos (decisão out/2026): créditos vêm só dos planos e de ajustes do admin. Ficam no banco (`configuracoes`, chave `precos`; padrão em `domain/precos.ts`) com histórico em `configuracoes_historico`. Todo o sistema lê de `services/precos.ts`. Cada pedido grava o detalhamento cobrado (`pedidos.creditos_detalhe`), então mudar preços não altera pedidos antigos.
- Relatórios (admin, `/equipe/relatorios`, `services/relatorios.ts`): faturamento (mensalidades, avulsos, receita recorrente, gráfico de 12 meses), créditos (vendidos, consumidos, devolvidos, saldo em aberto), fluxo de jobs (no prazo, ajustes, aprovação de primeira), margem por tipo de peça e por designer. Receita do job = créditos × valor médio do crédito (pago ÷ vendidos). Custo = custo padrão (`domain/custos.ts`, função `custoPadrao`) com as premissas editáveis na seção Custos de produção da tela Preços (valor/hora, horas por peça e faixa, adicionais, locução, retrabalho, impostos e meta de margem); não há registro de horas reais.
- E-mails (out/2026, `services/email.ts`, nodemailer): enviados de **noreply@darkkitchen.art.br** pelo SMTP da UOL Host (`smtps.uhserver.com`, porta 465, SSL); respostas vão para sac@. Configuração e senha em `plataforma/.env.local` (fora do git; `APP_URL` = endereço usado nos links). Cada `notificar()` também enfileira um e-mail (`emails_fila`, gravado na mesma transação) e há boas-vindas no cadastro; a fila é enviada a cada 30s e logo após enfileirar, com novas tentativas. Login recusado não gasta tentativas (os e-mails esperam). Contas de teste (@teste.com, @tmp.local) nunca recebem. Situação da fila na tela Acessos. Cada pessoa escolhe na tela Conta o que recebe (`usuarios.email_avisos`: todos, só os importantes, nenhum); `notificar(..., IMPORTANTE)` marca os importantes (pagamento, créditos, prazos, pedido para revisar/produzir, atendimento) e `SEM_EMAIL` deixa só no sininho. **Comentários do cliente não geram e-mail** (decisão out/2026). Boas-vindas e e-mails de senha saem sempre.
- Recuperação de senha (out/2026, `services/recuperacao.ts`): `/esqueci-senha` manda um link de uso único (1 hora; no máximo 3 por hora; no banco só o hash, tabela `senha_tokens`) para `/redefinir-senha`. A resposta não revela se o e-mail existe. Trocar a senha encerra as sessões abertas e manda um e-mail de aviso. O link usa o endereço por onde a pessoa acessou, só se for conhecido (local, rede local, túnel do Cloudflare ou APP_URL).
- Acessos (admin, `/equipe/acessos`, `services/acessos.ts`, out/2026): conta páginas vistas do site público e da área do cliente (a da equipe não conta) via `components/ContadorAcessos.tsx` no layout raiz → `POST /api/v1/acessos`. Visitante único = código anônimo diário (hash de chave secreta + dia + IP + navegador; o IP não é guardado), robôs e recargas em menos de 30s ignorados. Logins registrados em `acessos_logins` (site, cadastro, app; "Acessar como" não conta). Tela: visitantes hoje/7/30 dias, gráfico diário, páginas mais vistas, logins por tipo de conta e últimos logins.
- Troca de plano (`services/assinaturas.ts`): para plano com mais créditos é IMEDIATA (cobra a diferença de preço e credita a diferença de créditos; renovação segue na mesma data). Para plano menor fica agendada em `assinaturas.plano_proximo` e é aplicada na renovação; escolher o plano atual cancela o agendamento. Upgrade fica bloqueado com pagamento pendente.
- Plano **Personalizado** (out/2026): 4º plano, sem valor fixo (cartão no site e na Conta do cliente e aviso no cadastro, sem preço, com contato/chat). O admin combina créditos e valor por mês e aplica na conta do cliente (`/equipe/contas/[id]`, seção Plano; `aplicarPersonalizado`): sem assinatura, começa na hora; com assinatura, "agora" (cobra, lança os créditos, período recomeça hoje, saldo anterior mantido) ou "na próxima renovação". Valores em `assinaturas.personalizado_preco/_creditos`, `plano_id = 'personalizado'` (id reservado, fora da tabela de planos). Sempre usar `planoDaAssinatura(a)` para saber o plano de uma assinatura. O cliente pode sair do Personalizado trocando para um plano comum, mas não escolhe o Personalizado sozinho.
- Assinatura (out/2026, `services/assinaturas.ts`, `processarAssinaturas`, roda a cada hora em `instrumentation.ts` e ao abrir a área do cliente):
  - **Renovação automática** ligada por padrão; o cliente desliga/liga em Conta (`assinaturas.renovacao_automatica`). Desligada: vale até `periodo_fim` e termina sem cobrança (descarta troca agendada). Religar antes do fim não cobra nada. Depois de encerrada, assinar de novo cobra e começa período novo.
  - **Créditos expiram no fim de cada período do plano** (mês da assinatura, não do calendário): o saldo vira um lançamento `expiracao` e os créditos do novo período entram. Aviso 2 dias antes (`aviso_expiracao`). Sem assinatura ativa, o saldo expira no fim do mês do calendário (Brasília).
  - **Cobrança recusada** (gateway simulado recusa cartão final 0000): fatura "falhou", carência de `CARENCIA_DIAS` (3) com nova tentativa por dia (`inadimplente_desde`, `proxima_tentativa`, `tentativas_cobranca`), sem créditos novos, faixa de aviso e botão "Tentar pagar agora". Vencida a carência, a assinatura termina. Pago na carência, o novo período começa no pagamento.
  - Relatórios: receita recorrente só conta assinaturas com renovação ligada e em dia; créditos expirados aparecem à parte.
- Conclusão do pedido: pelo cliente ("Aprovar peça"), pelo diretor (com motivo, ação `concluir`) ou automática após `DIAS_APROVACAO_AUTOMATICA` (5) dias úteis com o cliente, com lembrete 1 dia útil antes. A automática roda a cada hora (`instrumentation.ts`) e ao abrir as áreas logadas. A métrica de aprovação de primeira só conta aprovações do próprio cliente.
- Acesso pela internet em desenvolvimento: túnel do Cloudflare (`*.trycloudflare.com`) liberado em `next.config.ts` (`allowedDevOrigins` e `serverActions.allowedOrigins`); sem isso a página abre mas não responde a cliques. Atenção: com o túnel aberto, as contas de teste ficam acessíveis pela internet.
- Comandos (em `plataforma/`): `npm run dev` (http://localhost:3000; atalho `iniciar-servidor.bat` na raiz), `npm run build`, `npm run producao`, `npm run backup`, `npm run lint`, `npm run db:reset` (apaga o banco; recriado com dados de teste ao subir em desenvolvimento). Instalação no servidor: `INSTALACAO.md`.
- Contas de teste (senha `quadro123`): cliente@, designer@, senior@, diretor@, admin@teste.com.
- Papéis (out/2026): cliente, designer, diretor de arte (triagem, atribuição, controle de qualidade, conclusão, cancelamento; o antigo "gerente de projetos" foi fundido aqui — `migrar()` em db.ts converte contas antigas) e admin. O admin pode tudo (`podeExecutar`), gerencia contas em `/equipe/contas` (criar, editar, senha temporária, remover/desativar, ajustar créditos) e usa "Acessar como" para agir na conta de qualquer usuário (sessão original guardada no cookie `dk_admin`). Contas com histórico nunca são apagadas, só desativadas (`usuarios.ativo`).

**Princípios para o futuro app mobile:** lógica no servidor exposta como API (`/api/v1/...`), login por token, layout mobile-first, uploads pela API, créditos como extrato de transações, status do pedido como máquina de estados, avisos centralizados em `services/notificacoes.ts`.

**Fases:** 1) site público ✅ · 2) login, perfis e banco ✅ · 3) briefing + área do cliente ✅ · 4) área da equipe ✅ · 5) assinatura e pagamento ✅ (simulado; falta ligar gateway real).

**Pendências conhecidas:** pagamento com cartão (oculto; precisa de gateway real) e confirmação automática do Pix (hoje manual pelo admin); armazenamento de arquivos em nuvem e upload em partes para vídeos grandes; API para renovação/pagamento pendente (hoje só pela tela).

## Formulário de briefing (8 etapas)
Existe um protótipo clicável em HTML (`briefing-motion.html`, publicado como artifact no claude.ai).
1. **Tipo de peça:** post animado, vídeo curto, vídeo explicativo, animação de logo. Define os campos seguintes (lógica condicional).
2. **Contexto:** objetivo, público, onde será publicado, chamada para ação. (Logo: onde a vinheta será usada.)
3. **Técnico:** proporções (9:16, 1:1, 4:5, 16:9), duração, áudio (locução só em vídeo curto/explicativo), legendas, arquivo aberto (.aep).
4. **Conteúdo:** roteiro por cena com contador de palavras (~1,5 palavra/segundo), opção "não tenho roteiro", locução (texto + tipo de voz), informações obrigatórias. (Logo: tipo de revelação + slogan.)
5. **Marca:** logo (obrigatório), manual e fontes, fotos, cores, seguir padrão ou visual de campanha. Fica salvo no perfil.
6. **Estilo:** estilo de animação, referências com "o que você gosta nela", tom, o que evitar.
7. **Prazo e aprovação:** padrão ou urgente (+50%), quem aprova e e-mail.
8. **Revisão:** resumo com botão "Editar" por etapa.

## Processo de reprovação
- **Interna:** diretor de arte reprova com diagnóstico (tipo de erro, cena, minutagem) → volta só a parte com problema para o designer. Limite de tentativas; depois escala para designer mais sênior.
- **Cliente — ajuste:** comentários com marcação de tempo no vídeo; separar ajuste (incluso nas revisões) de mudança de escopo (cobra créditos, avisar antes).
- **Cliente — rejeição total:** sai da fila, conversa humana com o cliente, ajusta o briefing e recomeça.
- **Créditos:** revisões do plano grátis; extras cobradas; erro da plataforma = refaz sem custo; mudança de ideia do cliente = cobrança parcial. Na dúvida, favorecer o cliente.
- Registrar todo motivo de reprovação para melhorar formulário, triagem e a taxa de aprovação de primeira (métrica principal).

## Precificação
**Premissas:** designer R$ 60/h; diretor de arte R$ 90/h; impostos e taxas 15%; margem bruta alvo 40% → preço = custo direto ÷ 0,45. **1 crédito = R$ 50** (preço avulso). Uso digital apenas; TV/mídia nacional sob consulta.

| Serviço | Horas (designer + curadoria) | Custo direto | Preço | Créditos |
|---|---|---|---|---|
| Post animado (até 10s) | 3h + 0,5h | R$ 235 | R$ 500 | 10 |
| Vídeo curto (até 15s) | 5h + 0,75h | R$ 378 | R$ 850 | 17 |
| Vídeo curto (até 30s) | 8h + 1h | R$ 580 | R$ 1.300 | 26 |
| Explicativo (até 30s) | 14h + 2h | R$ 1.040 | R$ 2.300 | 46 |
| Explicativo (até 60s) | 24h + 3h | R$ 1.730 | R$ 3.800 | 76 |
| Explicativo (até 90s) | 34h + 4h | R$ 2.420 | R$ 5.400 | 108 |
| Logo (até 5s) | 6h + 1h | R$ 460 | R$ 1.000 | 20 |
| Logo (até 8s) | 9h + 1,2h | R$ 658 | R$ 1.500 | 30 |

**Adicionais:** formato extra 3 cr (até 30s) / 6 cr (acima); locução 8 / 12 / 16 cr (30 / 60 / 90s, margem ~15% por ser repasse); roteiro 4 cr (post/curto) / 12 cr (explicativo); personagens +40%; arquivo aberto +30%; urgência +50%; revisão extra 3 / 6 cr. Legendas inclusas.

**Referências de mercado (2026):** hora de motion designer autônomo ~R$ 31–159; reels 15s R$ 300–1.500; explicativo 60s R$ 3.000–12.000; vinheta R$ 300–3.000.

As horas são estimativas — recalibrar com o tempo real dos primeiros pedidos.

## Próximo passo (out/2026): migrar para a máquina servidor
A plataforma roda num computador com **Windows 10** do dono, como servidor, exposto pela internet por **conexão direta no IP público** (decisão do dono: sem Cloudflare), com o **Caddy** fazendo o HTTPS. Atenção: o Windows 10 não recebe atualizações de segurança desde out/2025 (recomendado: Windows 11, ESU ou Ubuntu Server). Uma VPS Linux fica para depois, quando houver clientes pagando; o código não muda.

**Etapa 1 — no código: ✅ feita (out/2026).** Guia completo em `INSTALACAO.md` (raiz do repositório).
- Modo produção (`npm run producao` = `next start -H 127.0.0.1 -p 3000`, só local; o acesso de fora é pelo túnel): `instrumentation.ts` chama `server/producao.ts` em vez do `seed.ts`. Com banco vazio cria só o admin de `ADMIN_EMAIL`/`ADMIN_NOME`/`ADMIN_SENHA_INICIAL` (.env.local); se já houver admin ativo, não cria. Sempre desativa contas `@teste.com` e derruba as sessões delas. O banco atual já tem admins reais (contato@ e david@darkkitchen.art.br).
- Limite de tentativas (`services/limites.ts`, tabela `limites_tentativas`): login 5 erros por e-mail ou 20 por IP em 15 min → bloqueio de 15 min; "esqueci minha senha" 10 por IP por hora. IP por `server/ip.ts` (cf-connecting-ip).
- Endereço: `next.config.ts` libera o host do `APP_URL` e `DOMINIOS_EXTRA` (além de `*.trycloudflare.com`); mudar o `APP_URL` exige recompilar. `poweredByHeader` desligado.
- `DK_DADOS` troca a pasta de dados (usado para testar produção sem mexer no banco de desenvolvimento).
- Scripts em `plataforma/scripts/`: `producao.ps1` (roda e reinicia, log diário em `plataforma/logs`), `instalar-servico.ps1` (tarefas do Agendador do Windows "Dark Kitchen - Servidor" ao ligar e "Dark Kitchen - Backup" às 3h, logon S4U sem senha guardada), `atualizar.ps1` (backup, para, git pull, npm ci, build, sobe), `backup.mjs` (`npm run backup`: banco por `VACUUM INTO` com verificação de integridade, 30 dias; arquivos só os novos, nunca apaga no destino; `BACKUP_DESTINO\backup.log`). Os .ps1 são só ASCII (PowerShell 5.1 erra acentos). Modelo de configuração: `plataforma/.env.exemplo` (vai para o git; o `.env.local` não).
- Testado: build de produção, banco vazio (só admin), cópia dos dados reais (5 contas de teste desativadas, clientes e pedidos mantidos), cookie `secure`, bloqueio após 5 senhas erradas, backup repetido no mesmo segundo.

**Etapa 2 — máquina servidor: ✅ feita (09/10/2026, pelo Claude via SSH).**
- Servidor: Windows 10 Pro 22H2, 16 GB, na rede local do dono. Acesso do Claude: **SSH só na rede local**, por chave, com o atalho `ssh darkkitchen-servidor` (`~/.ssh/config` da máquina de desenvolvimento). IP, porta e usuário ficam na memória local do Claude, **não neste arquivo** (o repositório é público). Nunca abrir a porta do SSH no roteador. Via SSH: `$env:USERDOMAIN` vem "WORKGROUP" (usar `[Security.Principal.WindowsIdentity]::GetCurrent().Name`), o winget não funciona, e saída de erro do Node vira "NativeCommandError" (não é falha).
- Instalado: Node v24.13.0 (MSI, SHA-256 conferido), Git 2.56 (instalador oficial), projeto em **`C:\darkkitchen\projeto`** (git clone), `.env.local` do servidor (APP_URL `https://darkkitchen.art.br`, DOMINIOS_EXTRA www, BACKUP_DESTINO `C:\darkkitchen\bkp`), dados copiados e **clientes apagados** com `limpar-clientes.mjs` (backup antes em `C:\darkkitchen\bkp\banco`), build de produção, tarefas "Dark Kitchen - Servidor" (rodando) e "Dark Kitchen - Backup" (testada, 3h). Para parar o servidor por completo: `scripts\parar.ps1` (só parar a tarefa deixa processos filhos vivos).

**Etapa 3 — endereço na internet (conexão direta): ✅ no ar em https://darkkitchen.art.br (09/10/2026).** Roteador (Huawei, "Mapeamento da porta", regra "DK") mapeia 80 e 443 para o servidor; pegadinha: o campo "porta da fonte externa" tem de ficar VAZIO (preenchido, nada passa). DNS: só o registro A `darkkitchen.art.br` mudou para o IP público no Editor de Zona do cPanel da UOL Host (`www` é CNAME e acompanha; MX/SPF/e-mail intactos). Certificados Let's Encrypt emitidos para o domínio e o www.
- **Sem início automático (decisão do dono, out/2026):** nem a plataforma (tarefa "Dark Kitchen - Servidor" sem gatilho) nem o Caddy (serviço manual) sobem com o Windows. Liga/desliga: `iniciar-producao.bat` / `parar-producao.bat` na raiz (pedem administrador), ou `Start-ScheduledTask "Dark Kitchen - Servidor"; Start-Service DarkKitchenCaddy`. Após reiniciar a máquina, o site fica fora do ar até alguém ligar. O backup das 3h continua agendado.
- ✅ Caddy 2.11.7 em `C:\darkkitchen\caddy` (SHA-512 conferido), config `plataforma/scripts/Caddyfile` (darkkitchen.art.br com HTTPS automático, www → principal, uploads até 2 GB, remove `Cf-Connecting-Ip`/`X-Real-Ip` vindos de fora para não burlar o limite de login, HSTS), serviço **DarkKitchenCaddy** (conta LocalService) **manual e PARADO**, firewall 80/443 só para o caddy.exe (`scripts/instalar-caddy.ps1`).
- Pendente com o dono: reserva de DHCP do IP local do servidor no roteador (para ele não mudar).

**Etapa 4 — ir para o ar:** admin real e contas de teste desativadas; trocar a senha da noreply@ (exposta no chat); testes finais (cadastro, Pix de R$ 1,00, e-mail, recuperação de senha, celular no 4G); monitor UptimeRobot; Termos de uso e Política de privacidade (LGPD).

**Decisões do dono (out/2026):**
- **Dados: "recomeçar do zero" = apagar só os clientes** e tudo deles; manter o resto (admins, equipe, preços/planos e histórico, Pix, estatísticas de visitas). Procedimento: copiar `plataforma/data` para o servidor e rodar `node scripts/limpar-clientes.mjs --confirmar` lá (sem `--confirmar` só simula; faz backup antes; apaga também os arquivos do disco; testado numa cópia dos dados reais). Não rodar na máquina de desenvolvimento (lá os dados de teste continuam úteis).
- **Admin real:** já existem contato@ e david@darkkitchen.art.br.
- **Backup:** `BACKUP_DESTINO=C:\darkkitchen\bkp` (no próprio disco do servidor; o dono sabe que não protege contra perda da máquina; segunda cópia externa fica para depois).
- **Endereço:** `darkkitchen.art.br` (+ www), DNS na UOL Host (`ns1/ns2.cpuh5.hospedagemuolhost.com.br`). **Instalação:** `C:\darkkitchen\`.
- **Repositório GitHub é público** (davidcasan/darkkitchen): o código e o CLAUDE.md ficam visíveis a qualquer um (sem senhas: `.env.local` e `data/` não vão para o git). Recomendado torná-lo privado; aí o servidor precisa de credencial para `git pull`.

Conversa completa com o Claude Code (para retomar com `claude --resume`): cópia na pasta "Dark Kitchen - Claude" do OneDrive da máquina antiga, com LEIA-ME de como restaurar. Contém senhas: não compartilhar.
